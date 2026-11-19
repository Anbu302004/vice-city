import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Realistic ocean: wave-displaced surface, scrolling detail normals, fresnel
// sky reflection, sun glitter, depth colour (turquoise shallows -> deep blue),
// see-through shallows, surf foam lines along every shore and white-caps.
// ---------------------------------------------------------------------------

// tileable normal map (R = nx, G = nz, B = ny, A = foam noise) built from random sine waves
function makeNormalMap(size = 256) {
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const waves = [];
  for (let k = 0; k < 14; k++) {
    const f = 2 + Math.floor(rnd() * 14);
    const a = rnd() * Math.PI * 2;
    waves.push({ fx: Math.round(Math.cos(a) * f), fy: Math.round(Math.sin(a) * f), ph: rnd() * 6.28, amp: 1 / (0.6 + f * 0.28) });
  }
  // noise for foam (tileable value noise)
  const G = 16, grid = new Float32Array(G * G);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const vnoise = (u, v) => {
    const x = u * G, y = v * G, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const g = (a, b) => grid[((b % G + G) % G) * G + ((a % G + G) % G)];
    return (g(xi, yi) * (1 - sx) + g(xi + 1, yi) * sx) * (1 - sy) + (g(xi, yi + 1) * (1 - sx) + g(xi + 1, yi + 1) * sx) * sy;
  };
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let dx = 0, dz = 0;
      for (const w of waves) {
        const c = Math.cos(2 * Math.PI * (w.fx * u + w.fy * v) + w.ph) * w.amp * 2 * Math.PI;
        dx += c * w.fx; dz += c * w.fy;
      }
      const s = 0.022;
      let nx = -dx * s, nz = -dz * s, ny = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const n = 0.55 * vnoise(u, v) + 0.3 * vnoise(u * 2, v * 2) + 0.15 * vnoise(u * 4, v * 4);
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255; data[i + 1] = (nz * 0.5 + 0.5) * 255; data[i + 2] = (ny * 0.5 + 0.5) * 255; data[i + 3] = n * 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export function makeWater({ size = 2600, seg = 240, land, cornerR, islands, sunDir }) {
  const uniforms = {
    uTime: { value: 0 },
    uNormalMap: { value: makeNormalMap() },
    uSunDir: { value: sunDir.clone().normalize() },
    uSunColor: { value: new THREE.Color(0xffb27a) },
    uSunPower: { value: 1 },
    uHorizon: { value: new THREE.Color(0xff9a6b) },
    uZenith: { value: new THREE.Color(0x6a2c91) },
    uDeep: { value: new THREE.Color(0x064a6e) },
    uShallow: { value: new THREE.Color(0x35d0c8) },
    uFogColor: { value: new THREE.Color(0xff9a6b) },
    uFogNear: { value: 80 }, uFogFar: { value: 520 },
    uLand: { value: land }, uCorner: { value: cornerR },
    uIslands: { value: islands.map((i) => new THREE.Vector4(i.x, i.z, i.r * 0.82, 0)) },
    uNight: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: true, fog: false,
    defines: { N_ISL: islands.length },
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vWN; varying float vH;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec2 p = wp.xz;
        float h = sin(p.x*0.045+uTime*0.9)*0.2 + sin(p.y*0.06-uTime*1.1)*0.17 + sin((p.x+p.y)*0.11+uTime*1.7)*0.07;
        float dx = 0.2*0.045*cos(p.x*0.045+uTime*0.9) + 0.07*0.11*cos((p.x+p.y)*0.11+uTime*1.7);
        float dz = 0.17*0.06*cos(p.y*0.06-uTime*1.1) + 0.07*0.11*cos((p.x+p.y)*0.11+uTime*1.7);
        wp.y += h;
        vWorld = wp.xyz; vH = h;
        vWN = normalize(vec3(-dx, 1.0, -dz));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uSunPower, uFogNear, uFogFar, uLand, uCorner, uNight;
      uniform sampler2D uNormalMap;
      uniform vec3 uSunDir, uSunColor, uHorizon, uZenith, uDeep, uShallow, uFogColor;
      uniform vec4 uIslands[N_ISL];
      varying vec3 vWorld; varying vec3 vWN; varying float vH;

      float shoreDist(vec2 p){
        vec2 q = abs(p) - vec2(uLand - uCorner);
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uCorner;
        for (int i = 0; i < N_ISL; i++) d = min(d, length(p - uIslands[i].xy) - uIslands[i].z);
        return d;
      }
      void main(){
        vec2 p = vWorld.xz;
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;

        // detail normals: three scrolling layers, fading with distance
        vec4 t1 = texture2D(uNormalMap, p*0.037 + vec2(uTime*0.010, uTime*0.006));
        vec4 t2 = texture2D(uNormalMap, p*0.091 + vec2(-uTime*0.017, uTime*0.012));
        vec4 t3 = texture2D(uNormalMap, p*0.31 + vec2(uTime*0.04, -uTime*0.027));
        vec2 dn = (t1.xz*2.0-1.0)*0.9 + (t2.xz*2.0-1.0)*0.6 + (t3.xz*2.0-1.0)*0.3;
        float detail = mix(1.0, 0.18, smoothstep(60.0, 420.0, dist));
        vec3 N = normalize(vec3(vWN.x + dn.x*detail, 1.0, vWN.z + dn.y*detail));

        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float fres = 0.03 + 0.97*pow(1.0 - ndv, 5.0);
        vec3 R = reflect(-V, N); R.y = abs(R.y);
        vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.5));
        float sd = max(dot(R, uSunDir), 0.0);
        vec3 glint = uSunColor * (pow(sd, 900.0)*38.0 + pow(sd, 90.0)*1.6 + pow(sd, 8.0)*0.18) * uSunPower;

        float sh = shoreDist(p);                       // metres from the nearest shore
        if (sh < -0.4) discard;                         // never poke through the beach
        float shallow = exp(-max(sh, 0.0)*0.05);
        vec3 body = mix(uDeep, uShallow, shallow);
        body = mix(body, uShallow*1.15, smoothstep(14.0, 0.0, sh) * 0.35);
        // light scattering in the crests that face the sun
        float sss = pow(clamp(dot(N, normalize(uSunDir + vec3(0.0, 0.5, 0.0))), 0.0, 1.0), 3.0) * 0.14;
        body += uShallow * sss * (1.0 - uNight*0.8);

        vec3 col = mix(body, sky, clamp(fres*0.65, 0.0, 1.0)) + glint;

        // surf foam: thick line at the edge + rolling lines running onto the beach
        float nz = t2.a;
        float edge = smoothstep(2.6, 0.0, sh + (nz - 0.5)*2.4 + sin(uTime*0.8 + p.x*0.07 + p.y*0.05)*0.9);
        float lines = smoothstep(0.6, 0.95, sin(sh*0.75 - uTime*1.05 + nz*2.0)*0.5 + 0.5) * smoothstep(26.0, 3.0, sh) * smoothstep(0.1, 0.7, nz);
        float cap = smoothstep(0.30, 0.44, vH + (t1.a - 0.5)*0.22) * 0.55;
        float foam = clamp(edge + lines*0.65 + cap, 0.0, 1.0);
        col = mix(col, vec3(0.93, 0.96, 0.98) * mix(1.0, 0.25, uNight), foam);

        float alpha = mix(0.35, 1.0, smoothstep(0.0, 16.0, sh));
        alpha = max(alpha, max(fres, foam));
        alpha = clamp(alpha, 0.0, 1.0);

        float ff = smoothstep(uFogNear, uFogFar, dist);
        col = mix(col, uFogColor, ff);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return { mesh, uniforms };
}
