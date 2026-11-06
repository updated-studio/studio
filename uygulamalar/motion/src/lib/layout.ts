import {useVideoConfig} from 'remotion';
import {brand} from './brand';

/** land = 16:9 (web, YouTube) · port = 9:16 (story, reels) · feed = 4:5 (Instagram akış). Kit §5: başka oran yok. */
export type Mode = 'land' | 'port' | 'feed';

export const useLayout = () => {
  const {width: W, height: H} = useVideoConfig();
  const mode: Mode = W > H ? 'land' : H / W > 1.5 ? 'port' : 'feed';
  const s = brand.safe;
  // Merkezden güvenli alan sınırları (kit §6)
  const box =
    mode === 'land'
      ? {left: -W / 2 + s.land.x, right: W / 2 - s.land.x, top: -H / 2 + s.land.y, bottom: H / 2 - s.land.y}
      : mode === 'port'
        ? {left: -W / 2 + s.port.x, right: W / 2 - (s.port.right ?? s.port.x), top: -H / 2 + s.port.top, bottom: H / 2 - s.port.bottom} // sağ: Reels/Shorts düğme sütunu (kit §6, 1.6)
        : {left: -W / 2 + s.feed.x, right: W / 2 - s.feed.x, top: -H / 2 + s.feed.y, bottom: H / 2 - s.feed.y};
  return {W, H, mode, safe: box, safeW: box.right - box.left, pick: <V,>(v: Record<Mode, V>): V => v[mode]};
};
