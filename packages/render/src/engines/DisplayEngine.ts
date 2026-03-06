import * as THREE from 'three';
import type { DisplaySettings, SceneMatchParams } from '@dooh/core';
import { DEFAULT_DISPLAY_SETTINGS } from '@dooh/core';
import { ledScreenVertexShader, ledScreenFragmentShader } from '../shaders/led-screen.glsl';

/**
 * DisplayEngine manages the LED screen material and the optional
 * glass overlay for a single screen quad.
 */
export class DisplayEngine {
  public readonly ledMaterial: THREE.ShaderMaterial;
  private settings: DisplaySettings;

  constructor(settings: DisplaySettings = DEFAULT_DISPLAY_SETTINGS) {
    this.settings = { ...settings };

    this.ledMaterial = new THREE.ShaderMaterial({
      vertexShader: ledScreenVertexShader,
      fragmentShader: ledScreenFragmentShader,
      uniforms: {
        uCreativeTexture: { value: null },
        uNits: { value: settings.screenNits },
        uPixelGrid: { value: settings.pixelGridIntensity },
        uAngleFalloff: { value: settings.angleFalloff ? 1.0 : 0.0 },
        uResolution: { value: new THREE.Vector2(1920, 1080) },
        // Scene match defaults
        uExposureOffset: { value: 0.0 },
        uSaturation: { value: 1.0 },
        uTemperatureBias: { value: 0.0 },
        uHighlightCompress: { value: 0.0 },
        // UV fit defaults (full frame)
        uUvOffset: { value: new THREE.Vector2(0, 0) },
        uUvScale: { value: new THREE.Vector2(1, 1) },
      },
      toneMapped: false,
      transparent: false,
      depthWrite: true,
    });
  }

  /** Set the creative texture (image or video) */
  setCreativeTexture(texture: THREE.Texture) {
    this.ledMaterial.uniforms.uCreativeTexture.value = texture;
    if (texture.image) {
      this.ledMaterial.uniforms.uResolution.value.set(
        texture.image.width ?? 1920,
        texture.image.height ?? 1080,
      );
    }
  }

  /** Update display settings */
  updateSettings(settings: Partial<DisplaySettings>) {
    Object.assign(this.settings, settings);
    const u = this.ledMaterial.uniforms;
    u.uNits.value = this.settings.screenNits;
    u.uPixelGrid.value = this.settings.pixelGridIntensity;
    u.uAngleFalloff.value = this.settings.angleFalloff ? 1.0 : 0.0;
  }

  /** Apply scene-match color correction */
  applySceneMatch(params: SceneMatchParams) {
    const u = this.ledMaterial.uniforms;
    u.uExposureOffset.value = params.exposureOffset;
    u.uSaturation.value = params.saturation;
    u.uTemperatureBias.value = params.temperatureBias / 6500; // normalize
    u.uHighlightCompress.value = params.highlightCompress;
  }

  /** Set UV fit (cover/contain) offsets */
  setUvFit(offset: { x: number; y: number }, scale: { x: number; y: number }) {
    this.ledMaterial.uniforms.uUvOffset.value.set(offset.x, offset.y);
    this.ledMaterial.uniforms.uUvScale.value.set(scale.x, scale.y);
  }

  dispose() {
    this.ledMaterial.dispose();
  }
}
