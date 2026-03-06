// ─── Glass Overlay Shader ──────────────────────────────────
// Renders a transparent glass layer on top of the LED screen with
// subtle reflection, Fresnel, and roughness.

export const glassVertexShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const glassFragmentShader = /* glsl */ `
precision highp float;

uniform float uRoughness;       // 0..1
uniform float uReflectivity;    // 0..1
uniform vec3 uTintColor;        // slight color tint
uniform sampler2D uEnvMap;      // optional environment/reflection sampler

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

float fresnelSchlick(float cosTheta, float f0) {
  return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  float ndotv = max(dot(vWorldNormal, viewDir), 0.0);

  // Fresnel reflection
  float fresnel = fresnelSchlick(ndotv, 0.04) * uReflectivity;

  // Fake environment reflection (simple gradient based on normal)
  vec3 reflectDir = reflect(-viewDir, vWorldNormal);
  float envY = reflectDir.y * 0.5 + 0.5;
  vec3 envColor = mix(
    vec3(0.08, 0.08, 0.10),  // ground reflection (dim)
    vec3(0.35, 0.38, 0.45),  // sky reflection
    smoothstep(0.3, 0.7, envY)
  );

  // Roughness reduces sharpness of reflection
  envColor = mix(envColor, vec3(dot(envColor, vec3(0.333))), uRoughness * 0.6);

  // Apply tint
  vec3 glassColor = envColor * uTintColor;

  // Final alpha based on fresnel reflection strength
  float alpha = fresnel * 0.6;

  gl_FragColor = vec4(glassColor, alpha);
}
`;
