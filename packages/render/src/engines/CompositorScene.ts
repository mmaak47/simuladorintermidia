import * as THREE from 'three';
import type { ScreenCorners, FitMode, DisplaySettings, CinematicSettings, SceneMatchParams } from '@dooh/core';
import { computeHomography, computeUvFit, computeScreenAspect } from '@dooh/core';
import { DisplayEngine } from './DisplayEngine';
import { GlassOverlayEngine } from './GlassOverlayEngine';
import { CinematicComposer } from './CinematicComposer';

/**
 * CompositorScene orchestrates the full rendering pipeline:
 *   - Background plate (location photo)
 *   - Perspective-warped screen quad with LED material
 *   - Glass overlay
 *   - Cinematic post-processing
 *
 * This class manages Three.js objects and should be integrated
 * with R3F via imperative handles or used standalone.
 */
export class CompositorScene {
  public readonly display: DisplayEngine;
  public readonly glass: GlassOverlayEngine;
  public readonly cinematic: CinematicComposer;

  public readonly scene: THREE.Scene;
  public readonly camera: THREE.OrthographicCamera;

  private screenMesh: THREE.Mesh | null = null;
  private glassMesh: THREE.Mesh | null = null;
  private backgroundMesh: THREE.Mesh | null = null;

  private imageWidth: number;
  private imageHeight: number;

  constructor(
    imageWidth: number,
    imageHeight: number,
    displaySettings?: DisplaySettings,
    cinematicSettings?: CinematicSettings,
  ) {
    this.imageWidth = imageWidth;
    this.imageHeight = imageHeight;

    this.scene = new THREE.Scene();

    // Orthographic camera matching image pixel space
    this.camera = new THREE.OrthographicCamera(
      0, imageWidth, 0, imageHeight, -10, 10,
    );
    this.camera.position.z = 5;

    this.display = new DisplayEngine(displaySettings);
    this.glass = new GlassOverlayEngine();
    this.cinematic = new CinematicComposer(imageWidth, imageHeight, cinematicSettings);
  }

  /** Set the background plate (location image) */
  setBackground(texture: THREE.Texture) {
    if (this.backgroundMesh) {
      this.scene.remove(this.backgroundMesh);
      this.backgroundMesh.geometry.dispose();
    }

    const geom = new THREE.PlaneGeometry(this.imageWidth, this.imageHeight);
    const mat = new THREE.MeshBasicMaterial({ map: texture, depthWrite: false });
    this.backgroundMesh = new THREE.Mesh(geom, mat);
    this.backgroundMesh.position.set(this.imageWidth / 2, this.imageHeight / 2, -1);
    this.backgroundMesh.renderOrder = 0;
    this.scene.add(this.backgroundMesh);
  }

  /**
   * Set screen quad from detected/edited corners.
   * Creates geometry with vertices at the 4 corner positions in pixel space.
   */
  setScreenCorners(corners: ScreenCorners) {
    // Remove old meshes
    if (this.screenMesh) {
      this.scene.remove(this.screenMesh);
      this.screenMesh.geometry.dispose();
    }
    if (this.glassMesh) {
      this.scene.remove(this.glassMesh);
      this.glassMesh.geometry.dispose();
    }

    const [tl, tr, br, bl] = corners;

    // Build custom geometry with 4 vertices
    const positions = new Float32Array([
      tl.x, tl.y, 0,
      tr.x, tr.y, 0,
      br.x, br.y, 0,
      bl.x, bl.y, 0,
    ]);

    const uvs = new Float32Array([
      0, 1,
      1, 1,
      1, 0,
      0, 0,
    ]);

    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.computeVertexNormals();

    // LED screen mesh
    this.screenMesh = new THREE.Mesh(geom, this.display.ledMaterial);
    this.screenMesh.renderOrder = 1;
    this.scene.add(this.screenMesh);

    // Glass overlay mesh (same geometry, slight Z offset)
    const glassGeom = geom.clone();
    this.glassMesh = new THREE.Mesh(glassGeom, this.glass.glassMaterial);
    this.glassMesh.position.z = 0.01;
    this.glassMesh.renderOrder = 2;
    this.scene.add(this.glassMesh);
  }

  /** Update the UV fit based on creative and screen dimensions */
  setFitMode(
    creativeWidth: number,
    creativeHeight: number,
    corners: ScreenCorners,
    fitMode: FitMode,
  ) {
    const screenAspect = computeScreenAspect(corners);
    const fit = computeUvFit(creativeWidth, creativeHeight, screenAspect, fitMode);
    this.display.setUvFit(
      { x: fit.offsetX, y: fit.offsetY },
      { x: fit.scaleX, y: fit.scaleY },
    );
  }

  /** Apply scene match correction */
  applySceneMatch(params: SceneMatchParams) {
    this.display.applySceneMatch(params);
  }

  dispose() {
    this.display.dispose();
    this.glass.dispose();
    this.cinematic.dispose();
    if (this.screenMesh) this.screenMesh.geometry.dispose();
    if (this.glassMesh) this.glassMesh.geometry.dispose();
    if (this.backgroundMesh) {
      this.backgroundMesh.geometry.dispose();
      (this.backgroundMesh.material as THREE.MeshBasicMaterial).dispose();
    }
  }
}
