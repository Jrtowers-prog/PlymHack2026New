/**
 * RouteMap.native — WebView-based Google Maps for Expo Go (no dev build needed).
 *
 * Embeds the full Google Maps JS API inside a WebView so the native app
 * gets an interactive map with routes, markers, safety segments, road labels,
 * navigation tracking, etc — identical to the web version.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { RouteMapProps } from '@/src/components/maps/RouteMap.types';
import { env } from '@/src/config/env';

// ---------------------------------------------------------------------------
// Build the HTML page that runs Google Maps inside the WebView
// ---------------------------------------------------------------------------

const buildMapHtml = (apiKey: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body,#map{width:100%;height:100%;overflow:hidden;touch-action:none}
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    // ── State ──────────────────────────────────────────────────
    var map, gm;
    var markers = [];
    var polylines = [];
    var navMarker = null;
    var longPressTimer = null;
    var longPressPos = null;
    var touchMoved = false;

    // ── Helpers ────────────────────────────────────────────────
    function clearArray(arr) {
      for (var i = 0; i < arr.length; i++) arr[i].setMap(null);
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
    function initMap() {
      gm = google.maps;
      map = new gm.Map(document.getElementById('map'), {
        center: { lat: 50.3755, lng: -4.1427 },
        zoom: 13,
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: 'greedy',
      });

      // Normal click / tap
      gm.event.addListener(map, 'click', function(e) {
        if (e.latLng) {
          sendMsg('press', { lat: e.latLng.lat(), lng: e.latLng.lng() });
        }
      });

      // Right-click (desktop fallback)
      gm.event.addListener(map, 'rightclick', function(e) {
        if (e.latLng) {
          sendMsg('longpress', { lat: e.latLng.lat(), lng: e.latLng.lng() });
        }
      });

      // ── Touch-based long-press (mobile) ──
      // Google Maps JS swallows raw touch events for its own gestures,
      // so we detect long-press by timing touchstart → touchend and
      // converting the screen coordinates to lat/lng via the map bounds.
      var mapDiv = document.getElementById('map');

      mapDiv.addEventListener('touchstart', function(e) {
        touchMoved = false;
        if (e.touches.length === 1) {
          var touch = e.touches[0];
          longPressPos = { x: touch.clientX, y: touch.clientY };
          longPressTimer = setTimeout(function() {
            if (!touchMoved && longPressPos) {
              // Convert screen point → LatLng via map bounds
              var bounds = map.getBounds();
              if (bounds) {
                var ne = bounds.getNorthEast();
                var sw = bounds.getSouthWest();
                var mapEl = mapDiv.getBoundingClientRect();
                var xFrac = longPressPos.x / mapEl.width;
                var yFrac = longPressPos.y / mapEl.height;
                var lat = ne.lat() - yFrac * (ne.lat() - sw.lat());
                var lng = sw.lng() + xFrac * (ne.lng() - sw.lng());
                sendMsg('longpress', { lat: lat, lng: lng });
              }
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
    }

    // ── Update handler (called from RN via injectJavaScript) ──
    function updateMap(data) {
      if (!map || !gm) return;

      clearArray(markers);
      clearArray(polylines);

      var bounds = new gm.LatLngBounds();
      var hasBounds = false;

      // Origin – blue dot
      if (data.origin) {
        var pos = new gm.LatLng(data.origin.lat, data.origin.lng);
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">' +
          '<circle cx="12" cy="12" r="11" fill="#4285F4" opacity="0.25"/>' +
          '<circle cx="12" cy="12" r="7" fill="#4285F4"/>' +
          '<circle cx="12" cy="12" r="3.5" fill="#ffffff"/></svg>';
        markers.push(new gm.Marker({
          position: pos, map: map, title: 'Your location', zIndex: 50,
          icon: { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
                  scaledSize: new gm.Size(24,24), anchor: new gm.Point(12,12) },
        }));
        bounds.extend(pos);
        hasBounds = true;
      }

      // Destination marker
      if (data.destination) {
        var dPos = new gm.LatLng(data.destination.lat, data.destination.lng);
        markers.push(new gm.Marker({ position: dPos, map: map, title: 'Destination' }));
        bounds.extend(dPos);
        hasBounds = true;
      }

      // Unselected routes – grey, wider stroke for touch targets
      (data.routes || []).forEach(function(r) {
        if (r.selected) return;
        var path = r.path.map(function(p) { return new gm.LatLng(p.lat, p.lng); });
        var pl = new gm.Polyline({
          path: path, strokeColor: '#98a2b3', strokeOpacity: 0.5,
          strokeWeight: 5, map: map, clickable: true,
        });
        gm.event.addListener(pl, 'click', function() {
          sendMsg('selectRoute', { id: r.id });
        });
        polylines.push(pl);
        path.forEach(function(p) { bounds.extend(p); });
        hasBounds = true;
      });

      // Selected route – safety-coloured segments or blue fallback
      var sel = (data.routes || []).find(function(r) { return r.selected; });
      if (sel) {
        if (data.segments && data.segments.length > 0) {
          data.segments.forEach(function(seg) {
            var segPath = seg.path.map(function(p) { return new gm.LatLng(p.lat, p.lng); });
            polylines.push(new gm.Polyline({
              path: segPath, strokeColor: seg.color, strokeOpacity: 0.9,
              strokeWeight: 7, map: map, clickable: false,
            }));
          });
        } else {
          var selPath = sel.path.map(function(p) { return new gm.LatLng(p.lat, p.lng); });
          polylines.push(new gm.Polyline({
            path: selPath, strokeColor: '#4285F4', strokeOpacity: 0.85,
            strokeWeight: 6, map: map, clickable: false,
          }));
        }
        sel.path.forEach(function(p) { bounds.extend(new gm.LatLng(p.lat, p.lng)); });
        hasBounds = true;
      }

      // Safety markers
      var markerColors = { crime: '#ef4444', shop: '#22c55e', light: '#facc15' };
      (data.safetyMarkers || []).forEach(function(m) {
        markers.push(new gm.Marker({
          position: new gm.LatLng(m.lat, m.lng), map: map,
          title: m.label || m.kind,
          icon: { path: 0, scale: 4,
                  fillColor: markerColors[m.kind] || '#94a3b8',
                  fillOpacity: 0.9, strokeColor: '#fff', strokeWeight: 1 },
        }));
      });

      // Road labels
      (data.roadLabels || []).forEach(function(lbl) {
        var text = lbl.name.slice(0, 12);
        var w = Math.round(text.length * 6.5 + 16);
        var h = 18;
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
          '<rect rx="' + (h/2) + '" ry="' + (h/2) + '" width="' + w + '" height="' + h + '" fill="' + lbl.color + '" opacity="0.8"/>' +
          '<text x="' + (w/2) + '" y="12.5" text-anchor="middle" fill="white" font-size="9" font-weight="600" font-family="-apple-system,BlinkMacSystemFont,sans-serif" letter-spacing="0.3">' + text + '</text></svg>';
        markers.push(new gm.Marker({
          position: new gm.LatLng(lbl.lat, lbl.lng), map: map, clickable: false, zIndex: 30,
          icon: { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
                  scaledSize: new gm.Size(w, h), anchor: new gm.Point(w/2, h/2) },
        }));
      });

      // Fit bounds only when geography changed – with padding for phone UI
      if (data.fitBounds && hasBounds) {
        map.fitBounds(bounds, { top: 80, bottom: 120, left: 20, right: 20 });
        gm.event.addListenerOnce(map, 'idle', function() {
          if (map.getZoom() > 16) map.setZoom(16);
        });
      }

      // Pan-to
      if (data.panTo) {
        map.panTo(new gm.LatLng(data.panTo.lat, data.panTo.lng));
        if (map.getZoom() < 14) map.setZoom(14);
      }

      // Navigation marker
      if (navMarker) { navMarker.setMap(null); navMarker = null; }
      if (data.navLocation) {
        var heading = data.navHeading || 0;
        var arrowSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">' +
          '<circle cx="18" cy="18" r="16" fill="#1570EF" stroke="white" stroke-width="3"/>' +
          '<polygon points="18,6 24,22 18,18 12,22" fill="white" transform="rotate(' + heading + ', 18, 18)"/></svg>';
        navMarker = new gm.Marker({
          position: new gm.LatLng(data.navLocation.lat, data.navLocation.lng),
          map: map, zIndex: 999, clickable: false,
          icon: { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(arrowSvg),
                  scaledSize: new gm.Size(36,36), anchor: new gm.Point(18,18) },
        });
        map.panTo(new gm.LatLng(data.navLocation.lat, data.navLocation.lng));
        if (map.getZoom() < 17) map.setZoom(17);
      }
    }
  </script>
  <script src="https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap" async defer></script>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const RouteMap = ({
  origin,
  destination,
  routes,
  selectedRouteId,
  safetyMarkers = [],
  routeSegments = [],
  roadLabels = [],
  panTo,
  isNavigating = false,
  navigationLocation,
  navigationHeading,
  onSelectRoute,
  onLongPress,
  onMapPress,
}: RouteMapProps) => {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const prevGeoKeyRef = useRef('');
  const prevPanKeyRef = useRef(-1);

  // Keep latest props in refs so pushUpdate always reads fresh values
  // (fixes the stale-closure problem when called from the 'ready' handler)
  const propsRef = useRef({
    origin, destination, routes, selectedRouteId,
    safetyMarkers, routeSegments, roadLabels, panTo,
    isNavigating, navigationLocation, navigationHeading,
  });
  propsRef.current = {
    origin, destination, routes, selectedRouteId,
    safetyMarkers, routeSegments, roadLabels, panTo,
    isNavigating, navigationLocation, navigationHeading,
  };

  const callbacksRef = useRef({ onMapPress, onLongPress, onSelectRoute });
  callbacksRef.current = { onMapPress, onLongPress, onSelectRoute };

  // Serialize current props → a JS call the WebView can execute
  const pushUpdate = useCallback(() => {
    if (!readyRef.current || !webViewRef.current) return;

    const p = propsRef.current;
    const toLL = (c: { latitude: number; longitude: number }) => ({
      lat: c.latitude,
      lng: c.longitude,
    });

    const mappedRoutes = p.routes.map((r) => ({
      id: r.id,
      selected: r.id === p.selectedRouteId,
      path: r.path.map(toLL),
    }));

    const segments = p.routeSegments.map((seg) => ({
      color: seg.color,
      path: seg.path.map(toLL),
    }));

    const mkrs = p.safetyMarkers.map((m) => ({
      kind: m.kind,
      label: m.label,
      lat: m.coordinate.latitude,
      lng: m.coordinate.longitude,
    }));

    const labels = p.roadLabels.map((l) => ({
      name: l.displayName,
      color: l.color,
      lat: l.coordinate.latitude,
      lng: l.coordinate.longitude,
    }));

    // Detect geography changes to decide whether to fitBounds
    const geoKey = [
      p.origin ? `${p.origin.latitude},${p.origin.longitude}` : '',
      p.destination ? `${p.destination.latitude},${p.destination.longitude}` : '',
      p.routes.map((r) => r.id).join(','),
      p.selectedRouteId ?? '',
    ].join('|');
    const fitBounds = geoKey !== prevGeoKeyRef.current;
    if (fitBounds) prevGeoKeyRef.current = geoKey;

    // panTo
    let panToData: { lat: number; lng: number } | null = null;
    if (p.panTo && p.panTo.key !== prevPanKeyRef.current) {
      prevPanKeyRef.current = p.panTo.key;
      panToData = toLL(p.panTo.location);
    }

    const payload = {
      origin: p.origin ? toLL(p.origin) : null,
      destination: p.destination ? toLL(p.destination) : null,
      routes: mappedRoutes,
      segments,
      safetyMarkers: mkrs,
      roadLabels: labels,
      fitBounds,
      panTo: panToData,
      navLocation:
        p.isNavigating && p.navigationLocation
          ? toLL(p.navigationLocation)
          : null,
      navHeading: p.navigationHeading,
    };

    const js = `try{updateMap(${JSON.stringify(payload)})}catch(e){}true;`;
    webViewRef.current.injectJavaScript(js);
  }, []);

  // Push whenever any data changes
  useEffect(() => {
    pushUpdate();
  }, [
    origin,
    destination,
    routes,
    selectedRouteId,
    safetyMarkers,
    routeSegments,
    roadLabels,
    panTo,
    isNavigating,
    navigationLocation,
    navigationHeading,
    pushUpdate,
  ]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        const cbs = callbacksRef.current;
        switch (msg.type) {
          case 'ready':
            readyRef.current = true;
            // Flush update now that the map is ready
            pushUpdate();
            break;
          case 'press':
            cbs.onMapPress?.({ latitude: msg.lat, longitude: msg.lng });
            break;
          case 'longpress':
            cbs.onLongPress?.({ latitude: msg.lat, longitude: msg.lng });
            break;
          case 'selectRoute':
            cbs.onSelectRoute?.(msg.id);
            break;
        }
      } catch {
        // ignore parse errors
      }
    },
    [pushUpdate],
  );

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: buildMapHtml(env.googleMapsApiKey) }}
        style={StyleSheet.absoluteFill}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMessage}
        scrollEnabled={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        startInLoadingState={false}
        cacheEnabled
        // Android: allow mixed content (http tiles from https page)
        mixedContentMode="compatibility"
        // Prevent pull-to-refresh interfering on Android
        {...(Platform.OS === 'android' ? { nestedScrollEnabled: true } : {})}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f4f7' },
});

export default RouteMap;
