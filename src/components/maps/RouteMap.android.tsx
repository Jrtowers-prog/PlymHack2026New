/**
 * RouteMap.android — Leaflet + OSM tiles in a WebView (100 % free, no API key).
 *
 * Replaces Google Maps JS API in WebView entirely.
 */
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { RouteMapProps } from '@/src/components/maps/RouteMap.types';

// ---------------------------------------------------------------------------
// Build the HTML page that runs Leaflet + OSM tiles inside the WebView
// ---------------------------------------------------------------------------

const buildMapHtml = (mapType: string = 'roadmap') => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%;overflow:hidden;touch-action:none}
    #viewport{width:100%;height:100%;overflow:hidden;position:relative}
    #map{width:100%;height:100%;touch-action:none;transition:transform 0.5s ease-out;transform-origin:center 65%}
    .map-ctrl{position:absolute;right:12px;bottom:100px;z-index:1000;display:flex;flex-direction:column;gap:4px}
    .map-btn{width:42px;height:42px;border:none;border-radius:10px;background:rgba(255,255,255,.95);
      box-shadow:0 2px 8px rgba(0,0,0,.2);font-size:22px;font-weight:700;color:#1D2939;
      cursor:pointer;display:flex;align-items:center;justify-content:center;
      -webkit-tap-highlight-color:transparent;user-select:none;pointer-events:auto;line-height:1;touch-action:auto}
    .map-btn:active{background:#e4e7ec}
    .recenter-btn{position:absolute;right:12px;bottom:50px;z-index:1000;width:42px;height:42px;
      border:none;border-radius:50%;background:rgba(255,255,255,.95);
      box-shadow:0 2px 8px rgba(0,0,0,.2);cursor:pointer;display:none;align-items:center;
      justify-content:center;pointer-events:auto;touch-action:auto}
    .recenter-btn:active{background:#e4e7ec}
    .road-label{background:rgba(0,0,0,.7);color:#fff;padding:2px 8px;border-radius:9px;
      font-size:9px;font-weight:600;white-space:nowrap;border:none;box-shadow:none}
  </style>
</head>
<body>
  <div id="viewport">
    <div id="map"></div>
    <div class="map-ctrl">
      <button class="map-btn" onclick="map.zoomIn()">+</button>
      <button class="map-btn" onclick="map.zoomOut()">&minus;</button>
    </div>
    <button class="recenter-btn" id="recenterBtn" onclick="recenterMap()">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1D2939" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>
    </button>
  </div>
  <script>
    var map, tileLayer;
    var markers = [];
    var polylines = [];
    var navMarker = null;
    var longPressTimer = null;
    var longPressPos = null;
    var touchMoved = false;
    var isNavMode = false;
    var currentRotation = 0;
    var userInteracted = false;
    var lastNavLL = null;

    function clearArray(arr) {
      for (var i = 0; i < arr.length; i++) map.removeLayer(arr[i]);
      arr.length = 0;
    }

    function sendMsg(type, data) {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify(
          Object.assign({ type: type }, data || {})
        ));
      } catch(e) {}
    }

    // ── Init ───────────────────────────────────────────────────
    map = L.map('map', {
      center: [50.3755, -4.1427],
      zoom: 13,
      zoomControl: false,
      attributionControl: true,
    });

    tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    // Normal click / tap
    map.on('click', function(e) {
      sendMsg('press', { lat: e.latlng.lat, lng: e.latlng.lng });
    });

    // Right-click (desktop fallback)
    map.on('contextmenu', function(e) {
      sendMsg('longpress', { lat: e.latlng.lat, lng: e.latlng.lng });
    });

    // ── Touch-based long-press (mobile) ──
    var mapDiv = document.getElementById('map');

    mapDiv.addEventListener('touchstart', function(e) {
      touchMoved = false;
      if (e.touches.length === 1) {
        var touch = e.touches[0];
        longPressPos = { x: touch.clientX, y: touch.clientY };
        longPressTimer = setTimeout(function() {
          if (!touchMoved && longPressPos) {
            var pt = map.containerPointToLatLng(L.point(longPressPos.x, longPressPos.y));
            sendMsg('longpress', { lat: pt.lat, lng: pt.lng });
          }
          longPressTimer = null;
        }, 600);
      }
    }, { passive: true });

    mapDiv.addEventListener('touchmove', function(e) {
      if (longPressPos && e.touches.length === 1) {
        var dx = e.touches[0].clientX - longPressPos.x;
        var dy = e.touches[0].clientY - longPressPos.y;
        if (Math.sqrt(dx*dx + dy*dy) > 10) {
          touchMoved = true;
          if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        }
      }
    }, { passive: true });

    mapDiv.addEventListener('touchend', function() {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      longPressPos = null;
    }, { passive: true });

    mapDiv.addEventListener('touchcancel', function() {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      longPressPos = null;
    }, { passive: true });

    sendMsg('ready', {});

    // Track user drag to pause auto-follow in nav mode
    map.on('dragstart', function() { if (isNavMode) userInteracted = true; });

    // Recenter on user location
    function recenterMap() {
      userInteracted = false;
      if (lastNavLL) {
        map.panTo(lastNavLL);
        if (map.getZoom() < 17) map.setZoom(17);
      }
    }

    // Navigation view — 3D perspective tilt + heading rotation
    function setNavView(heading, entering) {
      var mapEl = document.getElementById('map');
      var btn = document.getElementById('recenterBtn');
      if (!entering) {
        isNavMode = false;
        currentRotation = 0;
        userInteracted = false;
        mapEl.style.transform = 'none';
        if (btn) btn.style.display = 'none';
        return;
      }
      isNavMode = true;
      if (btn) btn.style.display = 'flex';
      // Shortest-path rotation to avoid spinning the long way around
      var target = -(heading || 0);
      var diff = target - currentRotation;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;
      currentRotation += diff;
      mapEl.style.transform = 'perspective(800px) rotateX(40deg) rotate(' + currentRotation + 'deg) scale(1.5)';
    }

    // ── Update handler (called from RN via injectJavaScript) ──
    function updateMap(data) {
      clearArray(markers);
      clearArray(polylines);

      var bounds = L.latLngBounds([]);
      var hasBounds = false;

      // Origin – blue dot (hidden during navigation)
      if (data.origin && !data.navLocation) {
        var pos = L.latLng(data.origin.lat, data.origin.lng);
        markers.push(L.circleMarker(pos, {
          radius: 8, fillColor: '#4285F4', fillOpacity: 1,
          color: '#fff', weight: 3,
        }).bindTooltip('Your location').addTo(map));
        markers.push(L.circleMarker(pos, {
          radius: 3.5, fillColor: '#fff', fillOpacity: 1,
          color: '#fff', weight: 0,
        }).addTo(map));
        bounds.extend(pos);
        hasBounds = true;
      }

      // Destination marker
      if (data.destination) {
        var dPos = L.latLng(data.destination.lat, data.destination.lng);
        markers.push(L.marker(dPos).bindTooltip('Destination').addTo(map));
        bounds.extend(dPos);
        hasBounds = true;
      }

      // Unselected routes – grey
      (data.routes || []).forEach(function(r) {
        if (r.selected) return;
        var path = r.path.map(function(p) { return [p.lat, p.lng]; });
        var pl = L.polyline(path, { color: '#98a2b3', opacity: 0.5, weight: 5 }).addTo(map);
        pl.on('click', function() { sendMsg('selectRoute', { id: r.id }); });
        polylines.push(pl);
        bounds.extend(pl.getBounds());
        hasBounds = true;
      });

      function nearestIdx(path, pt) {
        var best = 0, bestD = 1e18;
        for (var i = 0; i < path.length; i++) {
          var dlat = path[i].lat - pt.lat, dlng = path[i].lng - pt.lng;
          var d = dlat*dlat + dlng*dlng;
          if (d < bestD) { bestD = d; best = i; }
        }
        return best;
      }

      // Selected route
      var sel = (data.routes || []).find(function(r) { return r.selected; });
      if (sel) {
        if (data.navLocation && sel.path.length > 1) {
          var navPt = { lat: data.navLocation.lat, lng: data.navLocation.lng };
          var splitIdx = nearestIdx(sel.path, navPt);

          if (splitIdx > 0) {
            var tp = [];
            for (var ti = 0; ti <= splitIdx; ti++) tp.push([sel.path[ti].lat, sel.path[ti].lng]);
            tp.push([navPt.lat, navPt.lng]);
            polylines.push(L.polyline(tp, { color: '#1D2939', opacity: 0.7, weight: 7 }).addTo(map));
          }

          if (data.segments && data.segments.length > 0) {
            data.segments.forEach(function(seg) {
              var fp = []; var started = false;
              for (var si = 0; si < seg.path.length; si++) {
                var sp = seg.path[si];
                if (!started) {
                  var spIdx = nearestIdx(sel.path, sp);
                  if (spIdx >= splitIdx) started = true;
                }
                if (started) fp.push([sp.lat, sp.lng]);
              }
              if (fp.length >= 2) {
                polylines.push(L.polyline(fp, { color: seg.color, opacity: 0.9, weight: 7 }).addTo(map));
              }
            });
          } else {
            var remPath = [[navPt.lat, navPt.lng]];
            for (var ri = splitIdx; ri < sel.path.length; ri++) {
              remPath.push([sel.path[ri].lat, sel.path[ri].lng]);
            }
            polylines.push(L.polyline(remPath, { color: '#4285F4', opacity: 0.85, weight: 6 }).addTo(map));
          }
        } else {
          if (data.segments && data.segments.length > 0) {
            data.segments.forEach(function(seg) {
              var segPath = seg.path.map(function(p) { return [p.lat, p.lng]; });
              polylines.push(L.polyline(segPath, { color: seg.color, opacity: 0.9, weight: 7 }).addTo(map));
            });
          } else {
            var selPath = sel.path.map(function(p) { return [p.lat, p.lng]; });
            polylines.push(L.polyline(selPath, { color: '#4285F4', opacity: 0.85, weight: 6 }).addTo(map));
          }
        }
        sel.path.forEach(function(p) { bounds.extend(L.latLng(p.lat, p.lng)); });
        hasBounds = true;
      }

      // Safety markers
      var markerColors = { crime: '#ef4444', shop: '#22c55e', light: '#facc15', bus_stop: '#3b82f6' };
      (data.safetyMarkers || []).forEach(function(m) {
        markers.push(L.circleMarker([m.lat, m.lng], {
          radius: 4,
          fillColor: markerColors[m.kind] || '#94a3b8',
          fillOpacity: 0.9, color: '#fff', weight: 1,
        }).bindTooltip(m.label || m.kind).addTo(map));
      });

      // Road labels
      (data.roadLabels || []).forEach(function(lbl) {
        var text = lbl.name.slice(0, 12);
        var icon = L.divIcon({
          className: '',
          html: '<div class="road-label" style="background:' + lbl.color + '">' + text + '</div>',
          iconSize: null,
        });
        markers.push(L.marker([lbl.lat, lbl.lng], { icon: icon, interactive: false }).addTo(map));
      });

      // Fit bounds
      if (data.fitBounds && hasBounds && !data.navLocation) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }

      // Pan-to
      if (data.panTo) {
        map.panTo([data.panTo.lat, data.panTo.lng]);
        if (map.getZoom() < 14) map.setZoom(14);
      }

      // Navigation marker + 3D nav view
      if (navMarker) { map.removeLayer(navMarker); navMarker = null; }
      if (data.navLocation) {
        var heading = data.navHeading || 0;
        lastNavLL = [data.navLocation.lat, data.navLocation.lng];
        var arrowSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">' +
          '<circle cx="22" cy="22" r="19" fill="#1570EF" stroke="white" stroke-width="3"/>' +
          '<polygon points="22,7 29,27 22,22 15,27" fill="white" transform="rotate(' + heading + ', 22, 22)"/></svg>';
        var navIcon = L.divIcon({
          className: '',
          html: '<img src="data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(arrowSvg) + '" width="44" height="44"/>',
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });
        navMarker = L.marker(lastNavLL, { icon: navIcon, interactive: false, zIndexOffset: 1000 }).addTo(map);
        if (!userInteracted) {
          map.panTo(lastNavLL);
          if (map.getZoom() < 17) map.setZoom(17);
        }
        setNavView(heading, true);
      } else {
        setNavView(0, false);
      }
    }

    // ── Set tile layer dynamically ──
    function setMapType(type) {
      var urls = {
        roadmap: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        hybrid: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        terrain: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
      };
      var attrs = {
        roadmap: '&copy; OpenStreetMap',
        satellite: '&copy; Esri',
        hybrid: '&copy; Esri | &copy; OSM',
        terrain: '&copy; OpenTopoMap',
      };
      if (tileLayer) map.removeLayer(tileLayer);
      tileLayer = L.tileLayer(urls[type] || urls.roadmap, {
        attribution: attrs[type] || attrs.roadmap,
        maxZoom: 19,
      }).addTo(map);
    }
  </script>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Component placeholder — full implementation follows
// ---------------------------------------------------------------------------

export const RouteMap = (_props: RouteMapProps) => (
  <View style={styles.container} />
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f4f7', overflow: 'hidden' as const },
});

export default RouteMap;
