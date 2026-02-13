/**
 * PathfindingAnimation — Maze-solving lines radiating from the logo.
 *
 * Thin lines grow outward from behind the logo circle, branching
 * and winding across the screen like a maze being solved until the
 * entire background is covered. The center stays clear for the logo.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

const GRID = 26;
const LINE = 2;
const COLS = Math.ceil(W / GRID) + 1;
const ROWS = Math.ceil(H / GRID) + 1;
const MX = W / 2;
const MY = H / 2;
const CLEAR_R = 92; // empty circle for logo

type Seg = { x: number; y: number; w: number; h: number; t: number };

function buildMaze(): Seg[] {
  const px = (c: number) => c * GRID;
  const py = (r: number) => r * GRID;
  const inside = (r: number, c: number) => {
    const dx = px(c) - MX;
    const dy = py(r) - MY;
    return dx * dx + dy * dy < CLEAR_R * CLEAR_R;
  };
  const key = (r: number, c: number) => r * 10000 + c;
  const vis = new Set<number>();
  const out: Seg[] = [];
  let ord = 0;

  // Seeded PRNG
  let sd = 31415;
  const rn = () => {
    sd = (sd * 48271) % 2147483647;
    return sd / 2147483647;
  };
  const shuf = <T,>(a: T[]): T[] => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rn() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Exclude circle interior
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (inside(r, c)) vis.add(key(r, c));

  // Find border nodes — just outside the logo circle
  const D: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const border: [number, number][] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (vis.has(key(r, c))) continue;
      for (const [dr, dc] of D) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && inside(nr, nc)) {
          border.push([r, c]);
          break;
        }
      }
    }
  shuf(border);

  // Iterative randomised DFS — creates winding maze corridors
  const dfs = (sr: number, sc: number) => {
    if (vis.has(key(sr, sc))) return;
    vis.add(key(sr, sc));
    const stk: [number, number][] = [[sr, sc]];
    while (stk.length) {
      const [cr, cc] = stk[stk.length - 1];
      const nb = shuf(
        D.map(([dr, dc]) => [cr + dr, cc + dc] as [number, number]),
      ).filter(
        ([nr, nc]) =>
          nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !vis.has(key(nr, nc)),
      );
      if (!nb.length) {
        stk.pop();
        continue;
      }
      const [nr, nc] = nb[0];
      vis.add(key(nr, nc));
      const x1 = px(cc);
      const y1 = py(cr);
      const x2 = px(nc);
      const y2 = py(nr);
      out.push(
        cr === nr
          ? { x: Math.min(x1, x2), y: y1 - LINE / 2, w: GRID, h: LINE, t: ord++ }
          : { x: x1 - LINE / 2, y: Math.min(y1, y2), w: LINE, h: GRID, t: ord++ },
      );
      stk.push([nr, nc]);
    }
  };

  for (const [r, c] of border) dfs(r, c);

  // Normalise t → 0..1
  const mx = Math.max(ord - 1, 1);
  for (const s of out) s.t /= mx;
  return out;
}

export const PathfindingAnimation: React.FC = () => {
  const segs = useMemo(() => buildMaze(), []);
  const prog = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(prog, {
      toValue: 1,
      duration: 2800,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <View style={st.wrap} pointerEvents="none">
      {segs.map((sg, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute' as const,
            left: sg.x,
            top: sg.y,
            width: sg.w,
            height: sg.h,
            borderRadius: LINE / 2,
            backgroundColor: '#94A3B8',
            opacity: prog.interpolate({
              inputRange: [Math.max(0, sg.t - 0.008), sg.t + 0.002],
              outputRange: [0, 0.3],
              extrapolate: 'clamp',
            }),
          }}
        />
      ))}
    </View>
  );
};

const st = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
});
