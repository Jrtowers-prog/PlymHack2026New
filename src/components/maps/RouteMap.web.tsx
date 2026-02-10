/**
 * RouteMap.web — Leaflet + OpenStreetMap tiles (100 % free, no API key).
 *
 * Replaces Google Maps JS SDK entirely.  All features preserved:
 *   – Route polylines (safety-coloured segments)
 *   – Safety markers (crime, shop, light, bus_stop)
 *   – Road labels, navigation mode, pan-to, long-press, click handlers
 *   – Map type switching (roadmap / satellite / hybrid / terrain)
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MapType, RouteMapProps } from '@/src/components/maps/RouteMap.types';

// ── Tile URLs for different map styles (all free / no key) ───────────────────

const TILE_URLS: Record<MapType, string> = {
  roadmap: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  satellite:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  hybrid:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  terrain: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
};

const TILE_ATTR: Record<MapType, string> = {
  roadmap:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  satellite: '&copy; Esri, Maxar, Earthstar Geographics',
  hybrid:
    '&copy; Esri | &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  terrain:
    '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
};

// ── Build Leaflet HTML page (embedded in iframe blob) ────────────────────────

const buildLeafletHtml = () => `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden}
#viewport{width:100%;height:100%;overflow:hidden;position:relative}
#map{width:100%;height:100%;transition:transform 0.5s ease-out;transform-origin:center 65%}
.nav-arrow{background:none;border:none}
.map-ctrl{position:absolute;right:12px;bottom:100px;z-index:1000;display:flex;flex-direction:column;gap:4px}
.map-btn{width:38px;height:38px;border:none;border-radius:8px;background:rgba(255,255,255,.95);
  box-shadow:0 2px 8px rgba(0,0,0,.2);font-size:20px;font-weight:700;color:#1D2939;
  cursor:pointer;display:flex;align-items:center;justify-content:center;user-select:none;line-height:1}
.map-btn:hover{background:#e4e7ec}
.recenter-btn{position:absolute;right:12px;bottom:50px;z-index:1000;width:38px;height:38px;
  border:none;border-radius:50%;background:rgba(255,255,255,.95);
  box-shadow:0 2px 8px rgba(0,0,0,.2);cursor:pointer;display:none;align-items:center;justify-content:center}
.recenter-btn:hover{background:#e4e7ec}
.road-label{background:rgba(0,0,0,.7);color:#fff;padding:2px 8px;border-radius:9px;
  font-size:9px;font-weight:600;white-space:nowrap;border:none;box-shadow:none}
</style>
</head><body>
<div id="viewport">
<div id="map"></div>
<div class="map-ctrl">
<button class="map-btn" onclick="map.zoomIn()">+</button>
<button class="map-btn" onclick="map.zoomOut()">&minus;</button>
</div>
<button class="recenter-btn" id="recenterBtn" onclick="recenterMap()">
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1D2939" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>
</button>
</div>
<script>
var map,tileLayer,markers=[],polylines=[],navMarker=null,longPressTimer=null,longPressLatLng=null;
var isNavMode=false,currentRotation=0,userInteracted=false,lastNavLL=null;

function clearArr(a){for(var i=0;i<a.length;i++)map.removeLayer(a[i]);a.length=0;}

function sendMsg(t,d){
  try{var m=Object.assign({type:t},d||{});
    window.parent.postMessage(JSON.stringify(m),'*');
    window.dispatchEvent(new CustomEvent('leaflet-msg',{detail:m}));
  }catch(e){}
}

map=L.map('map',{center:[50.3755,-4.1427],zoom:13,zoomControl:false,attributionControl:true});
tileLayer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'&copy; OpenStreetMap',maxZoom:19}).addTo(map);

map.on('contextmenu',function(e){sendMsg('longpress',{lat:e.latlng.lat,lng:e.latlng.lng});});
var touchStart=null;
map.on('mousedown',function(e){touchStart=Date.now();longPressLatLng=e.latlng;
  longPressTimer=setTimeout(function(){if(longPressLatLng)sendMsg('longpress',{lat:longPressLatLng.lat,lng:longPressLatLng.lng});},600);});
map.on('mousemove',function(){if(longPressTimer){clearTimeout(longPressTimer);longPressTimer=null;}});
map.on('mouseup',function(){if(longPressTimer){clearTimeout(longPressTimer);longPressTimer=null;}});
map.on('click',function(e){if(Date.now()-(touchStart||0)<500)sendMsg('press',{lat:e.latlng.lat,lng:e.latlng.lng});});
sendMsg('ready',{});

map.on('dragstart',function(){if(isNavMode)userInteracted=true;});

