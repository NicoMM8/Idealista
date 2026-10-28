/**
 * UMBRAL — CORTE AXONOMÉTRICO 3D DE HABITABILIDAD VERTICAL (Three.js)
 * Modela un bloque residencial mediterráneo con:
 *  - Planta Baja (Cota 0) con patio
 *  - 1ª Planta (apta sin ascensor o con ascensor)
 *  - Plantas 2ª a 6ª (aptas exclusivamente con núcleo de ascensor activo)
 *  - Núcleo vertical de ascensor iluminado con cabina animada
 *  - Simulación de asoleamiento por hora del día
 */

(function () {
  let scene, camera, renderer;
  let buildingGroup, elevatorCar, sunLight;
  let floorMeshes = [];
  let targetRotationY = -0.58;
  let currentRotationY = -0.58;
  let isDragging = false;
  let prevMouseX = 0;
  let activeFloorNum = null;
  let activeElevatorState = true;
  let targetElevatorY = 0.8;

  const FLOOR_COUNT = 7; // 0 (Bajo) to 6 (6ª/Ático)
  const FLOOR_HEIGHT = 0.72;

  function initThreeArchitecturalStage() {
    const container = document.getElementById("three-architectural-canvas");
    if (!container || typeof THREE === "undefined") return;

    const width = container.clientWidth || 540;
    const height = container.clientHeight || 450;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe6decb);
    scene.fog = new THREE.FogExp2(0xe6decb, 0.045);

    // Orthographic-like perspective for architectural axonometric feel
    camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);
    camera.position.set(8.2, 6.8, 9.4);
    camera.lookAt(0, 2.1, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Ambient warm paper illumination
    const ambient = new THREE.AmbientLight(0xfff6e8, 0.72);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xfff8ed, 0xc7bba6, 0.45);
    scene.add(hemi);

    // Directional Mediterranean Sun
    sunLight = new THREE.DirectionalLight(0xfff1d6, 1.35);
    sunLight.position.set(7.5, 11.5, 6.5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 30;
    const d = 6.5;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    buildingGroup = new THREE.Group();
    scene.add(buildingGroup);

    buildArchitecturalModel();
    bindInteractions(container);
    animate();
  }

  function buildArchitecturalModel() {
    // 1. Base Architectural Plinth & Urban Plot (Piedra Caliza)
    const plinthGeo = new THREE.BoxGeometry(7.2, 0.35, 5.6);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0xd5c9b4,
      roughness: 0.88,
      metalness: 0.05,
    });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.y = -0.175;
    plinth.receiveShadow = true;
    buildingGroup.add(plinth);

    // Blueprint grid lines on plinth
    const gridHelper = new THREE.GridHelper(7.0, 14, 0x181614, 0xbab09d);
    gridHelper.position.y = 0.01;
    buildingGroup.add(gridHelper);

    //Materials
    const travertineMat = new THREE.MeshStandardMaterial({
      color: 0xf2ece1,
      roughness: 0.75,
    });
    const terracottaMat = new THREE.MeshStandardMaterial({
      color: 0xb84a32,
      roughness: 0.65,
    });
    const mossMat = new THREE.MeshStandardMaterial({
      color: 0x264636,
      roughness: 0.6,
    });
    const ochreMat = new THREE.MeshStandardMaterial({
      color: 0xb58338,
      roughness: 0.6,
    });
    const darkIronMat = new THREE.MeshStandardMaterial({
      color: 0x22201e,
      roughness: 0.5,
      metalness: 0.4,
    });

    // 2. Construct the 7 residential levels (0 = Bajo .. 6 = Ático)
    for (let i = 0; i < FLOOR_COUNT; i++) {
      const floorGroup = new THREE.Group();
      const yBase = i * FLOOR_HEIGHT;
      floorGroup.position.y = yBase;

      const isPenthouse = i === FLOOR_COUNT - 1;
      const w = isPenthouse ? 3.5 : 4.1;
      const depth = isPenthouse ? 2.65 : 3.1;

      const bodyMat = travertineMat.clone();
      if (i === 0) {
        bodyMat.color.setHex(0xe8dfd1); // Ground floor stone plinth
      }

      const slabGeo = new THREE.BoxGeometry(w, FLOOR_HEIGHT - 0.07, depth);
      const slabMesh = new THREE.Mesh(slabGeo, bodyMat);
      slabMesh.position.y = (FLOOR_HEIGHT - 0.07) / 2;
      slabMesh.castShadow = true;
      slabMesh.receiveShadow = true;
      floorGroup.add(slabMesh);

      // Horizontal cornice band between floors
      const corniceGeo = new THREE.BoxGeometry(w + 0.12, 0.06, depth + 0.12);
      const corniceMat = new THREE.MeshStandardMaterial({ color: 0xcfc3ae, roughness: 0.8 });
      const cornice = new THREE.Mesh(corniceGeo, corniceMat);
      cornice.position.y = FLOOR_HEIGHT - 0.03;
      cornice.castShadow = true;
      floorGroup.add(cornice);

      // Architectural windows & balconies on front facade
      const winCount = isPenthouse ? 3 : 4;
      const windowMeshes = [];
      for (let wIdx = 0; wIdx < winCount; wIdx++) {
        const xPos = -w / 2 + 0.65 + wIdx * 0.92;
        if (Math.abs(xPos) < 0.42) continue; // Leave central bay for vertical elevator shaft

        const winGeo = new THREE.BoxGeometry(0.46, 0.46, 0.08);
        const winMat = new THREE.MeshStandardMaterial({
          color: 0x383430,
          emissive: 0x000000,
          roughness: 0.3,
        });
        const win = new THREE.Mesh(winGeo, winMat);
        win.position.set(xPos, FLOOR_HEIGHT * 0.48, depth / 2 + 0.02);
        floorGroup.add(win);
        windowMeshes.push(win);

        // Wrought-iron balcony on floors >= 1
        if (i >= 1) {
          const balcGeo = new THREE.BoxGeometry(0.62, 0.05, 0.28);
          const balc = new THREE.Mesh(balcGeo, darkIronMat);
          balc.position.set(xPos, 0.08, depth / 2 + 0.14);
          balc.castShadow = true;
          floorGroup.add(balc);
        }
      }

      // Ground floor private courtyard / patio on the side
      if (i === 0) {
        const patioWallGeo = new THREE.BoxGeometry(1.4, 0.42, 2.6);
        const patioWall = new THREE.Mesh(patioWallGeo, terracottaMat.clone());
        patioWall.position.set(w / 2 + 0.72, 0.21, 0);
        patioWall.castShadow = true;
        patioWall.receiveShadow = true;
        floorGroup.add(patioWall);
      }

      buildingGroup.add(floorGroup);
      floorMeshes.push({
        floorNum: i,
        group: floorGroup,
        slabMesh: slabMesh,
        baseColor: bodyMat.color.getHex(),
        windows: windowMeshes,
        targetOffsetX: 0,
        targetScale: 1,
      });
    }

    // 3. Central Vertical Elevator Core (Núcleo de Ascensor Acristalado)
    const totalHeight = FLOOR_COUNT * FLOOR_HEIGHT + 0.25;
    const shaftGeo = new THREE.BoxGeometry(0.76, totalHeight, 0.85);
    const shaftMat = new THREE.MeshPhysicalMaterial({
      color: 0x264636,
      transparent: true,
      opacity: 0.26,
      roughness: 0.15,
    });
    const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
    shaftMesh.position.set(0, totalHeight / 2, 1.32);
    buildingGroup.add(shaftMesh);

    // Elevator Car inside the shaft
    const carGeo = new THREE.BoxGeometry(0.56, 0.52, 0.62);
    const carMat = new THREE.MeshStandardMaterial({
      color: 0xb84a32,
      emissive: 0x4a180d,
      roughness: 0.35,
    });
    elevatorCar = new THREE.Mesh(carGeo, carMat);
    elevatorCar.position.set(0, FLOOR_HEIGHT * 2 + 0.32, 1.32);
    buildingGroup.add(elevatorCar);

    // 4. Mediterranean Trees (Cypress & Olive) on the architectural plinth
    const treePositions = [
      [-2.75, -1.6],
      [-2.85, 1.4],
      [2.95, 1.75],
    ];
    treePositions.forEach(([tx, tz], idx) => {
      const trunkGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.45, 8);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4632 });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(tx, 0.22, tz);
      trunk.castShadow = true;
      buildingGroup.add(trunk);

      const crownGeo =
        idx === 0
          ? new THREE.ConeGeometry(0.32, 1.45, 9)
          : new THREE.SphereGeometry(0.45, 10, 10);
      const crownMat = new THREE.MeshStandardMaterial({
        color: idx === 0 ? 0x2d4c3b : 0x556b4f,
        roughness: 0.85,
      });
      const crown = new THREE.Mesh(crownGeo, crownMat);
      crown.position.set(tx, idx === 0 ? 0.95 : 0.65, tz);
      crown.castShadow = true;
      buildingGroup.add(crown);
    });
  }

  function bindInteractions(container) {
    container.addEventListener("mousedown", (e) => {
      isDragging = true;
      prevMouseX = e.clientX;
    });
    window.addEventListener("mouseup", () => {
      isDragging = false;
    });
    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      prevMouseX = e.clientX;
      targetRotationY += deltaX * 0.0085;
    });

    window.addEventListener("resize", () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth || 540;
      const h = container.clientHeight || 450;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });

    // Bind Sun Hour Slider
    const sunSlider = document.getElementById("sun-hour-slider");
    const sunLabel = document.getElementById("sun-hour-label");
    if (sunSlider) {
      sunSlider.addEventListener("input", (e) => {
        const hour = parseFloat(e.target.value);
        updateSunPosition(hour);
        if (sunLabel) {
          const hh = Math.floor(hour).toString().padStart(2, "0");
          const mm = hour % 1 !== 0 ? "30" : "00";
          sunLabel.textContent = `${hh}:${mm} SOLAR`;
        }
      });
    }
  }

  function updateSunPosition(hour) {
    if (!sunLight) return;
    // Map hour [8..20] to solar arc
    const t = (hour - 8) / 12; // 0 to 1
    const angle = (t - 0.5) * Math.PI * 0.85;
    const radius = 11.5;
    sunLight.position.x = Math.sin(angle) * radius;
    sunLight.position.y = Math.cos(angle * 0.7) * 10.5 + 2.0;
    sunLight.position.z = 6.5 + Math.cos(angle) * 2.5;

    // Warm golden hour tint at morning/evening
    if (hour < 10 || hour > 18) {
      sunLight.color.setHex(0xffd29c);
    } else {
      sunLight.color.setHex(0xfff4df);
    }
  }

  function highlightFloor(floorNum, hasElevator, badgeText) {
    activeFloorNum = floorNum;
    activeElevatorState = hasElevator;

    const clampedFloor = Math.max(0, Math.min(FLOOR_COUNT - 1, floorNum || 0));
    targetElevatorY = hasElevator ? clampedFloor * FLOOR_HEIGHT + 0.34 : 0.34;

    floorMeshes.forEach((fm) => {
      const isTarget = fm.floorNum === clampedFloor;
      if (isTarget) {
        fm.slabMesh.material.color.setHex(hasElevator ? 0x264636 : 0xb84a32);
        fm.targetOffsetX = 0.26;
        fm.windows.forEach((w) => w.material.emissive.setHex(0xffb347));
      } else {
        fm.slabMesh.material.color.setHex(fm.baseColor);
        fm.targetOffsetX = 0;
        fm.windows.forEach((w) => w.material.emissive.setHex(0x000000));
      }
    });

    if (elevatorCar) {
      elevatorCar.material.color.setHex(hasElevator ? 0x264636 : 0xb58338);
    }

    const hudStatus = document.getElementById("three-active-callout");
    if (hudStatus && badgeText) {
      hudStatus.innerHTML = badgeText;
    }
  }

  function setSectionFilter(mode) {
    floorMeshes.forEach((fm) => {
      let match = false;
      if (mode === "all") match = true;
      else if (mode === "ground" && fm.floorNum === 0) match = true;
      else if (mode === "first_walkup" && fm.floorNum === 1) match = true;
      else if (mode === "elevator" && fm.floorNum >= 2) match = true;

      if (mode === "all") {
        fm.slabMesh.material.color.setHex(fm.baseColor);
        fm.targetOffsetX = 0;
        fm.windows.forEach((w) => w.material.emissive.setHex(0x000000));
      } else if (match) {
        const highlightHex =
          mode === "ground" ? 0xb84a32 : mode === "first_walkup" ? 0xb58338 : 0x264636;
        fm.slabMesh.material.color.setHex(highlightHex);
        fm.targetOffsetX = 0.22;
        fm.windows.forEach((w) => w.material.emissive.setHex(0xffae42));
      } else {
        fm.slabMesh.material.color.setHex(0xdcd3c2);
        fm.targetOffsetX = 0;
        fm.windows.forEach((w) => w.material.emissive.setHex(0x000000));
      }
    });

    if (mode === "ground") targetElevatorY = 0.34;
    else if (mode === "first_walkup") targetElevatorY = FLOOR_HEIGHT + 0.34;
    else if (mode === "elevator") targetElevatorY = FLOOR_HEIGHT * 4 + 0.34;
  }

  function animate() {
    requestAnimationFrame(animate);

    if (!isDragging && activeFloorNum === null) {
      targetRotationY += 0.0012; // Gentle architectural turntable drift
    }

    currentRotationY += (targetRotationY - currentRotationY) * 0.08;
    if (buildingGroup) {
      buildingGroup.rotation.y = currentRotationY;
    }

    // Smoothly animate floor plate pull-out
    floorMeshes.forEach((fm) => {
      fm.group.position.z += (fm.targetOffsetX - fm.group.position.z) * 0.12;
    });

    // Smoothly animate elevator car vertical travel
    if (elevatorCar) {
      elevatorCar.position.y += (targetElevatorY - elevatorCar.position.y) * 0.09;
    }

    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  window.UmbralThreeScene = {
    init: initThreeArchitecturalStage,
    highlightFloor: highlightFloor,
    setSectionFilter: setSectionFilter,
  };
})();

