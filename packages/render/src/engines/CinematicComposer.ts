import * as THREE from 'three';
import type { CinematicSettings } from '@dooh/core';
import { DEFAULT_CINEMATIC_SETTINGS } from '@dooh/core';
import { cinematicVertexShader, cinematicFragmentShader } from '../shaders/cinematic.glsl';

/**
 * CinematicComposer manages the post-processing pass that adds
 * subtle camera artifacts: bloom, vignette, grain, CA, highlight rolloff.
 *
 * Usage:
 *   1. Render main scene to a render target.
 *   2. Generate bloom texture (downscale + blur bright areas).
 *   3. Render a fullscreen quad with the cinematic material.
 */
export class CinematicComposer {
  public readonly material: THREE.ShaderMaterial;
  public readonly fullscreenQuad: THREE.Mesh;
  private settings: CinematicSettings;

  private bloomRenderTarget: THREE.WebGLRenderTarget;
  private sceneRenderTarget: THREE.WebGLRenderTarget;

  constructor(
    width: number,
    height: number,
    settings: CinematicSettings = DEFAULT_CINEMATIC_SETTINGS,
  ) {
    this.settings = { ...settings };

    this.sceneRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });

    // Bloom is rendered at half res
    this.bloomRenderTarget = new THREE.WebGLRenderTarget(
      Math.floor(width / 2),
      Math.floor(height / 2),
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      },
    );

    this.material = new THREE.ShaderMaterial({
      vertexShader: cinematicVertexShader,
      fragmentShader: cinematicFragmentShader,
      uniforms: {
        uScene: { value: this.sceneRenderTarget.texture },
        uBloomTexture: { value: this.bloomRenderTarget.texture },
        uResolution: { value: new THREE.Vector2(width, height) },
        uTime: { value: 0 },
        uBloomIntensity: { value: settings.bloomIntensity },
        uVignetteIntensity: { value: settings.vignetteIntensity },
        uGrainIntensity: { value: settings.grainIntensity },
        uChromaticAberration: { value: settings.chromaticAberration },
        uHighlightCompression: { value: settings.highlightCompression },
      },
      depthTest: false,
      depthWrite: false,
    });

    const geom = new THREE.PlaneGeometry(2, 2);
    this.fullscreenQuad = new THREE.Mesh(geom, this.material);
    this.fullscreenQuad.frustumCulled = false;
  }

  get sceneTarget(): THREE.WebGLRenderTarget {
    return this.sceneRenderTarget;
  }

  get bloomTarget(): THREE.WebGLRenderTarget {
    return this.bloomRenderTarget;
  }

  updateSettings(settings: Partial<CinematicSettings>) {
    Object.assign(this.settings, settings);
    const u = this.material.uniforms;
    u.uBloomIntensity.value = this.settings.bloomIntensity;
    u.uVignetteIntensity.value = this.settings.vignetteIntensity;
    u.uGrainIntensity.value = this.settings.grainIntensity;
    u.uChromaticAberration.value = this.settings.chromaticAberration;
    u.uHighlightCompression.value = this.settings.highlightCompression;
  }

  /** Call once per frame to advance grain animation */
  tick(time: number) {
    this.material.uniforms.uTime.value = time;
  }

  /** Resize render targets when canvas size changes */
  resize(width: number, height: number) {
    this.sceneRenderTarget.setSize(width, height);
    this.bloomRenderTarget.setSize(Math.floor(width / 2), Math.floor(height / 2));
    this.material.uniforms.uResolution.value.set(width, height);
  }

  dispose() {
    this.material.dispose();
    this.fullscreenQuad.geometry.dispose();
    this.sceneRenderTarget.dispose();
    this.bloomRenderTarget.dispose();
  }
}
