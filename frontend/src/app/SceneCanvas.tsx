// OWNER: architect. The 3D view, loaded lazily so the HUD and data come up before three.js.
// `linear` + `flat`: the station design is lit and coloured for three r150's legacy output (no sRGB encoding,
// no tone mapping), so the canvas renders the same way. The start position gives the design's home view direction:
// from the south-east (azimuth 45°), 22° above the horizon; CameraRig then sets the distance that fits the station.
import { Canvas } from '@react-three/fiber'
import { OfficeScene } from '../scene/OfficeScene'

export default function SceneCanvas() {
  return (
    <Canvas shadows="percentage" linear flat dpr={[1, 2]} camera={{ position: [38.8, 16.3, 34.6], fov: 35, near: 0.1, far: 1200 }}>
      <OfficeScene />
    </Canvas>
  )
}
