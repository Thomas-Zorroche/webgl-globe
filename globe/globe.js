/**
 * dat.globe Javascript WebGL Globe Toolkit
 * https://github.com/dataarts/webgl-globe
 *
 * Copyright 2011 Data Arts Team, Google Creative Lab
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

var DAT = DAT || {};

DAT.Globe = function(container, opts) {
  opts = opts || {};
  
  var colorFn = opts.colorFn || function(x) {
    var c = new THREE.Color();
    c.setHSL( ( 0.6 - ( x * 0.5 ) ), 1.0, 0.5 );
    return c;
  };
  var imgDir = opts.imgDir || '/globe/';

  var Shaders = {
    'earth' : {
      uniforms: {
        'texture': { type: 't', value: null },
        'colorAtmosphere': { type: "c", value: "new THREE.Color(0xaeeb34)" }
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'varying vec2 vUv;',
        'void main() {',
          'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
          'vNormal = normalize( normalMatrix * normal );',
          'vUv = uv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D texture;',
        'varying vec3 vNormal;',
        'varying vec2 vUv;',
        'uniform vec3 colorAtmosphere;',
        'void main() {',
          'vec3 diffuse = texture2D( texture, vUv ).xyz;',
          'float intensity = 1.05 - dot( vNormal, vec3( 0.0, 0.0, 1.0 ) );',
          'vec3 atmosphere = colorAtmosphere * pow( intensity, 3.0 );',
          'gl_FragColor = vec4( diffuse + atmosphere, 1.0 );',
        '}'
      ].join('\n')
    },
    'atmosphere' : {
      uniforms: {
        'color': { type: "c", value: "new THREE.Color(0xaeeb34)" }
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'void main() {',
          'vNormal = normalize( normalMatrix * normal );',
          'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vNormal;',
        'uniform vec3 color;',
        'void main() {',
          'float intensity = pow( 0.8 - dot( vNormal, vec3( 0, 0, 1.0 ) ), 12.0 ) * 0.5;',
          'gl_FragColor = vec4( color, 1.0 ) * intensity;',
        '}'
      ].join('\n')
    }
  };

  var camera, scene, renderer, w, h;
  var mesh, atmosphere, point;
  var materialAtmo, materialEarth;

  var overRenderer;

  var curZoomSpeed = 0;
  var zoomSpeed = 50;

  var mouse = { x: 0, y: 0 }, mouseOnDown = { x: 0, y: 0 };
  var rotation = { x: 0, y: 0 },
      target = { x: Math.PI*3/2, y: Math.PI / 6.0 },
      targetOnDown = { x: 0, y: 0 };

  var distance = 100000, distanceTarget = 100000;
  var padding = 40;
  var PI_HALF = Math.PI / 2;

  // Dataset variables
  var mapCountry = new Map();     // [ Country , [ latitude, longitude ] ]
  var mapClaim = new Map();       // [ Country, [...claims] ]
  var mapTemperature = new Map(); // [ [ latitude, longitude ], [color, temperature] ]

  var currentCountries = new Array();
  var maxClaimCount = 3;
  var needUpdate = true;

  const coldTemperatureHue = 50;
  const warmTemperatureHue = 0;
  const maxValue = 3.0
  const minValue = 0.3

  function init() {

    initScale();

    container.style.color = '#fff';
    container.style.font = '13px/20px Arial, sans-serif';

    var shader, uniforms;
    w = container.offsetWidth || window.innerWidth;
    h = container.offsetHeight || window.innerHeight;

    camera = new THREE.PerspectiveCamera(30, w / h, 1, 10000);
    camera.position.z = distance;

    scene = new THREE.Scene();

    var geometry = new THREE.SphereGeometry(200, 40, 30);

    shader = Shaders['earth'];
    uniforms = THREE.UniformsUtils.clone(shader.uniforms);

    uniforms['texture'].value = THREE.ImageUtils.loadTexture('world.jpg');

    materialEarth = new THREE.ShaderMaterial({

          uniforms: uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader

        });

    mesh = new THREE.Mesh(geometry, materialEarth);
    mesh.rotation.y = Math.PI;
    scene.add(mesh);

    shader = Shaders['atmosphere'];
    uniforms = THREE.UniformsUtils.clone(shader.uniforms);

    materialAtmo = new THREE.ShaderMaterial({

          uniforms: uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          transparent: true

        });

    mesh = new THREE.Mesh(geometry, materialAtmo);
    mesh.scale.set( 1.1, 1.1, 1.1 );
    scene.add(mesh);

    geometry = new THREE.BoxGeometry(0.75, 0.75, 1);
    geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0,0,-0.5));
    
    point = new THREE.Mesh(geometry);

    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(w, h);

    renderer.domElement.style.position = 'absolute';

    container.appendChild(renderer.domElement);

    container.addEventListener('mousedown', onMouseDown, false);

    container.addEventListener('mousewheel', onMouseWheel, false);

    document.addEventListener('keydown', onDocumentKeyDown, false);

    window.addEventListener('resize', onWindowResize, false);

    container.addEventListener('mouseover', function() {
      overRenderer = true;
    }, false);

    container.addEventListener('mouseout', function() {
      overRenderer = false;
    }, false);
  }

    /* accepts parameters
  * h  Object = {h:x, s:y, v:z}
  * OR 
  * h, s, v
  */
  function HSVtoRGB(h, s, v) {
    var r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
        s = h.s, v = h.v, h = h.h;
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return {
        r: Math.round(r * 255) / 255,
        g: Math.round(g * 255) / 255,
        b: Math.round(b * 255) / 255
    };
  }

  function addData(data, opts) {
    var i, step, colorFnWrapper;



    opts.animated = opts.animated || false;
    this.is_animated = opts.animated;
    opts.format = opts.format || 'magnitude'; // other option is 'legend'
    if (opts.format === 'magnitude') {
      step = 3;
      colorFnWrapper = function(data, i) { return colorFn(data[i+2]); }
    } else if (opts.format === 'legend') {
      step = 4;
      colorFnWrapper = function(data, i) { return colorFn(data[i+3]); }
    } else {
      throw('error: format not supported: '+opts.format);
    }

    if (opts.animated) {
      if (this._baseGeometry === undefined) {
        this._baseGeometry = new THREE.Geometry();
        for (i = 0; i < data.length; i++) {
          let tempRate = ((parseInt(data[i].AverageTemperature) + minValue) / (maxValue + minValue))
          let hue = coldTemperatureHue - (tempRate * (coldTemperatureHue - warmTemperatureHue));
          addPoint(data[i].Latitude, data[i].Longitude, 0, HSVtoRGB(hue / 360, 1, 1), this._baseGeometry);
        }
      }
      if(this._morphTargetId === undefined) {
        this._morphTargetId = 0;
      } else {
        this._morphTargetId += 1;
      }
      opts.name = opts.name || 'morphTarget'+this._morphTargetId;
    }
    var subgeo = new THREE.Geometry();

    mapTemperature.clear();
    for (i = 0; i < data.length; i++) {
      // 0 : cold --> 1 : warm
      let tempRate = ((parseInt(data[i].AverageTemperature) + minValue) / (maxValue + minValue))
      let hue = coldTemperatureHue - (tempRate * (coldTemperatureHue - warmTemperatureHue));
      addPoint(data[i].Latitude, data[i].Longitude, 0, HSVtoRGB(hue / 360, 1, 1), subgeo);
      
      // copy temperature in array
      const latitude = data[i].Latitude;
      const longitude = data[i].Longitude;
      const hsv = HSVtoRGB(hue / 360, 1, 1);
      const color = new THREE.Color(hsv.r, hsv.g, hsv.b)
      const temp = (data[i].AverageTemperature).toString().substring(0,3);
      mapTemperature.set({latitude, longitude}, { color, temp } )
    }

    if (opts.animated) {
      this._baseGeometry.morphTargets.push({'name': opts.name, vertices: subgeo.vertices});
    } else {
      this._baseGeometry = subgeo;
    }

  };

  function createPoints() {
    if (this._baseGeometry !== undefined) {
      if (this.is_animated === false) {
        this.points = new THREE.Mesh(this._baseGeometry, new THREE.MeshBasicMaterial({
              color: 0xffffff,
              vertexColors: THREE.FaceColors,
              morphTargets: false
            }));
      } else {
        if (this._baseGeometry.morphTargets.length < 8) {
          var padding = 8-this._baseGeometry.morphTargets.length;
          for(var i=0; i<=padding; i++) {
            this._baseGeometry.morphTargets.push({'name': 'morphPadding'+i, vertices: this._baseGeometry.vertices});
          }
        }
        this.points = new THREE.Mesh(this._baseGeometry, new THREE.MeshBasicMaterial({
              color: 0xffffff,
              vertexColors: THREE.FaceColors,
              morphTargets: true
            }));
      }
      scene.add(this.points);
    }
  }

  function addPoint(lat, lng, size, color, subgeo) {

    var phi = (90 - lat) * Math.PI / 180;
    var theta = (180 - lng) * Math.PI / 180;

    point.position.x = 200 * Math.sin(phi) * Math.cos(theta);
    point.position.y = 200 * Math.cos(phi);
    point.position.z = 200 * Math.sin(phi) * Math.sin(theta);

    point.lookAt(mesh.position);

    point.scale.z = Math.max( size, 0.1 ); // avoid non-invertible matrix
    point.scale.x = 3;
    point.scale.y = 3;
    point.updateMatrix();

    for (var i = 0; i < point.geometry.faces.length; i++) {

      point.geometry.faces[i].color = color;

    }
    if(point.matrixAutoUpdate){
      point.updateMatrix();
    }
    subgeo.merge(point.geometry, point.matrix);
  }

  function onMouseDown(event) {
    event.preventDefault();

    container.addEventListener('mousemove', onMouseMove, false);
    container.addEventListener('mouseup', onMouseUp, false);
    container.addEventListener('mouseout', onMouseOut, false);

    mouseOnDown.x = - event.clientX;
    mouseOnDown.y = event.clientY;

    targetOnDown.x = target.x;
    targetOnDown.y = target.y;

    container.style.cursor = 'move';
  }

  function onMouseMove(event) {
    mouse.x = - event.clientX;
    mouse.y = event.clientY;

    var zoomDamp = distance/1000;

    target.x = targetOnDown.x + (mouse.x - mouseOnDown.x) * 0.005 * zoomDamp;
    target.y = targetOnDown.y + (mouse.y - mouseOnDown.y) * 0.005 * zoomDamp;

    target.y = target.y > PI_HALF ? PI_HALF : target.y;
    target.y = target.y < - PI_HALF ? - PI_HALF : target.y;

    needUpdate = true;
    MouseX = event.clientX;
    MouseY = event.clientY;
  }

  function onMouseUp(event) {
    container.removeEventListener('mousemove', onMouseMove, false);
    container.removeEventListener('mouseup', onMouseUp, false);
    container.removeEventListener('mouseout', onMouseOut, false);
    container.style.cursor = 'auto';
  }

  function onMouseOut(event) {
    container.removeEventListener('mousemove', onMouseMove, false);
    container.removeEventListener('mouseup', onMouseUp, false);
    container.removeEventListener('mouseout', onMouseOut, false);
  }

  function onMouseWheel(event) {
    event.preventDefault();
    if (overRenderer) {
      zoom(event.wheelDeltaY * 0.3);
    }
    return false;
  }

  function onDocumentKeyDown(event) {
    switch (event.keyCode) {
      case 38:
        zoom(100);
        event.preventDefault();
        break;
      case 40:
        zoom(-100);
        event.preventDefault();
        break;
    }
  }

  function onWindowResize( event ) {
    camera.aspect = container.offsetWidth / container.offsetHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( container.offsetWidth, container.offsetHeight );
  }

  function zoom(delta) {

    distanceTarget -= delta;
    distanceTarget = distanceTarget > 1000 ? 1000 : distanceTarget;
    distanceTarget = distanceTarget < 350 ? 350 : distanceTarget;
  }

  function animate() {
    requestAnimationFrame(animate);
    render();
  }

  function getLatitudeAndLongitude() {
    const latitude = rotation.y * (180 / Math.PI);
    
    let longitude;
    if (Math.floor((rotation.x - 4.71239) / Math.PI) % 2 != 0)
    {
      if ((((rotation.x * (180 / Math.PI)) - 270) % 180) > 0)
        longitude = -180 + Math.abs( (((rotation.x * (180 / Math.PI)) - 270) % 180) ); // longitude en rad
      else
        longitude = 0 - Math.abs( (((rotation.x * (180 / Math.PI)) - 270) % 180) ); // longitude en rad
    }
    else
    {
      if ((((rotation.x * (180 / Math.PI)) - 270) % 180) > 0)
        longitude = ((rotation.x * (180 / Math.PI)) - 270) % 180; // longitude en rad
      else
        longitude = 180 - Math.abs( (((rotation.x * (180 / Math.PI)) - 270) % 180) ); // longitude en rad
    }

    return [latitude, longitude];
  }

  function render() {
    
    zoom(curZoomSpeed);

    if (needUpdate)
    {
      // Get countries in focus
      for (const [key, value] of mapCountry)
      {
        // If a country is in focus, and its claim is not already on screen, and that totalClaims < maxClaimCount
        if (isPointInsideCameraView(value.latitude, value.longitude, 5)) {
          if (currentCountries.length < maxClaimCount && isCountryClaimOnScreen(key) == -1) {
            let country = key;
            let claim = getRandomClaimMessage(country);
            currentCountries.push(country);
            createClaim(country, claim);
          }
        }
        // If a country is not in focus but still have it claim on screen, delete it
        else if (isCountryClaimOnScreen(key) != -1) {
          deleteClaim(key, isCountryClaimOnScreen(key));
        }
      }
  
      // Compute Atmosphere Color
      var atmosphereColor = new THREE.Color(1, 1, 1);
      var temperatureFocus = -1
      var precisionTemperature = 3
      for (const [key, value] of mapTemperature)
      {
        const dstToCamera = DstPointToCamera(key.latitude, key.longitude);
        if (dstToCamera < precisionTemperature)
        {
          precisionTemperature = dstToCamera;
          atmosphereColor = new THREE.Color(value.color);
          temperatureFocus = value.temp
        }
      }

      // Text Differential Temperature
      if (temperatureFocus === -1) {
        atmosphereColor = new THREE.Color(1, 1, 1);
        document.getElementById("Diff-Temp").innerHTML = ""
      } else {
        document.getElementById("Diff-Temp").innerHTML = "+" + temperatureFocus + "°C"
        document.getElementById("Diff-Temp").style.color = "rgb(" + atmosphereColor.r * 255 + "," + atmosphereColor.g * 255 + "," + atmosphereColor.b * 255 + ")";
      }

      // Transfrom Scale
      const indexScale = Math.floor((parseInt(temperatureFocus) + minValue) * (10 / (maxValue + minValue)));
      var UlContainer = document.getElementById("Temp-Scale").getElementsByTagName("ul")[0];
      if (temperatureFocus !== -1) {
        for (let i = 0; i < UlContainer.children.length; i++) {
          const scaleValue = 1 / (1 + Math.abs(indexScale - i));
          UlContainer.children[i].style.transform = "scale(" + scaleValue + ")";
        }
      } else {
        for (let i = 0; i < UlContainer.children.length; i++) {
          UlContainer.children[i].style.transform = "scale(" + 0.25 + ")";
        }
      }
  
      materialAtmo.uniforms.color.value = atmosphereColor;
      materialEarth.uniforms.colorAtmosphere.value = atmosphereColor;
      needUpdate = false;
    }

    rotation.x += (target.x - rotation.x) * 0.1;
    rotation.y += (target.y - rotation.y) * 0.1;
    distance += (distanceTarget - distance) * 0.3;

    camera.position.x = distance * Math.sin(rotation.x) * Math.cos(rotation.y);
    camera.position.y = distance * Math.sin(rotation.y);
    camera.position.z = distance * Math.cos(rotation.x) * Math.cos(rotation.y);

    camera.lookAt(mesh.position);

    renderer.render(scene, camera);
  }

  function isPointInsideCameraView(latitude, longitude, precision)
  {
    const coordinatesCamera = getLatitudeAndLongitude();
    return Math.abs(coordinatesCamera[0] - latitude) < precision && Math.abs(coordinatesCamera[1] - longitude) < precision;
  }

  function DstPointToCamera(latitude, longitude)
  {
    const coordinatesCamera = getLatitudeAndLongitude();
    return Math.abs(coordinatesCamera[0] - latitude) + Math.abs(coordinatesCamera[1] - longitude);
  }

  function initClaims(data)
  {
    for (const claim of data)
    {
      // Map Countries
      const latitude = claim.latitude;
      const longitude = claim.longitude;
      mapCountry.set(claim.country, {latitude, longitude});

      // Map Claims
      const message = [claim.text, claim.claim];
      const arrayClaims = mapClaim.get(claim.country) || [];

      mapClaim.set(claim.country, [...arrayClaims, message]);
    }

  }

  function getRandomClaimMessage(country)
  {
    const claimsFromCountry = mapClaim.get(country);
    const randomClaim = claimsFromCountry[Math.floor(Math.random() * claimsFromCountry.length)];
    return randomClaim;
  }

  function createClaim(country, claim)
  {
    const container = document.getElementById("Claim-Container");

    const divCountry = document.createElement("div");
    divCountry.className = "claim-country";
    divCountry.innerHTML = country;
    const divPP= document.createElement("span");
    divPP.className = "pp";
    divPP.innerHTML = "";
    divPP.style.backgroundColor = getPPColor(claim[1])
    const spanFAKE = document.createElement("span");
    spanFAKE.className = "fake";
    spanFAKE.innerHTML = "FAKE NEWS";

    const divTitle = document.createElement("div");
    divTitle.className = "title"
    divTitle.appendChild(divPP)
    divTitle.appendChild(divCountry);
    divTitle.appendChild(spanFAKE);

    const divMessage = document.createElement("div");
    divMessage.className = "claim-text";
    divMessage.innerHTML = claim[0];

    const divClaim = document.createElement("div");
    divClaim.className = "claim";

    let left, top;
    do {
      top = Math.floor(Math.random() * 0.5 * window.innerHeight) + (0.04 * window.innerHeight);
      left = Math.floor(Math.random() * 0.78 * window.innerWidth) + (0.02 * window.innerWidth);
    } while (left > (0.18 * window.innerWidth) && left < (0.67 * window.innerWidth) || isClaimColliding(top, left)); 

    divClaim.style.top = top + "px";
    divClaim.style.left = left + "px";
    divClaim.appendChild(divTitle);
    divClaim.appendChild(divMessage);
    
    container.appendChild(divClaim).focus();
    divClaim.className += " focus";
  }

  function deleteClaim(country, indexInArray)
  {
    const container = document.getElementById("Claim-Container");
    let index = 0;
    for (child of container.children) {
      if (child.getElementsByClassName("claim-country")[0].innerHTML === country) {
        break;
      }
      index++;
    }

    if (index < container.children.length) {
      container.removeChild(container.children[index]);
      currentCountries.splice(indexInArray, 1);
    }
  }

  function isClaimColliding(top, left) {
    const container = document.getElementById("Claim-Container").children;
    for (const child of container) {
      domRect = child.getBoundingClientRect();
      if ((left <= (domRect.right) && (left + 350) >= domRect.left) &&
          (top <= (domRect.bottom) && (top + 300) >= domRect.top)) {
        return true
      }
    }
    return false;
  }

  function isCountryClaimOnScreen(country)
  {
    let index = 0;
    for (currentCountry of currentCountries) {
      if (currentCountry === country) return index;
      index++;
    }
    return -1;
  }

  function initScale()
  {
    const containerUl = document.getElementById("Temp-Scale").getElementsByTagName("ul")[0];
    const step = coldTemperatureHue / 10.0

    let colorMax, colorMin;
    for (let i = 0; i < 10; i++) {
      let liScale = document.createElement("li");
      liScale.className = "scales"
      const color = HSVtoRGB((coldTemperatureHue - (i * step)) / 360.0, 1, 1)
      liScale.style.backgroundColor = "rgb(" + color.r * 255 + "," + color.g * 255 + "," + color.b * 255 + ")";
      containerUl.appendChild(liScale)
      if (i == 0) colorMin = color
      if (i == 9) colorMax = color
    }

    // Init span scales
    var spanElements = document.getElementById("Temp-Scale").getElementsByTagName("span");
    spanElements[0].innerHTML = "-" + minValue + "°C";
    spanElements[0].style.color = "rgb(" + colorMin.r * 255 + "," + colorMin.g * 255 + "," + colorMin.b * 255 + ")";
    spanElements[1].innerHTML = "+" + maxValue + "°C"; 
    spanElements[1].style.color = "rgb(" + colorMax.r * 255 + "," + colorMax.g * 255 + "," + colorMax.b * 255 + ")";

    // Init type scale color
    var spanElementsType = document.getElementById("Type-Scale").getElementsByTagName("span");
    for (let i = 0; i < spanElementsType.length; i++)
      spanElementsType[i].style.backgroundColor = getPPColor(i.toString());
  }

  function getPPColor(type)
  {
    const index = parseInt(type.substring(0, 1));
    switch (index)
    {
    case 0: return "#ADADAD" // No Claim
      
    case 1: return "#FF5964" // Global warming is not happening
      
    case 2: return "#FFE74C" // Human greenhouse gases are not causing climate change 
    
    case 3: return "#6BF178" // Climate impacts/global warming is beneficial/not bad
    
    case 4: return "#35A7FF" // Climate solutions won’t work
    
    case 5: return "#FFA058" // Climate movement/science is unreliable

    default: return "#ADADAD"
    }
  }



  init();
  this.animate = animate;

  this.__defineGetter__('time', function() {
    return this._time || 0;
  });

  this.__defineSetter__('time', function(t) {
    var validMorphs = [];
    var morphDict = this.points.morphTargetDictionary;
    for(var k in morphDict) {
      if(k.indexOf('morphPadding') < 0) {
        validMorphs.push(morphDict[k]);
      }
    }
    validMorphs.sort();
    var l = validMorphs.length-1;
    var scaledt = t*l+1;
    var index = Math.floor(scaledt);
    for (i=0;i<validMorphs.length;i++) {
      this.points.morphTargetInfluences[validMorphs[i]] = 0;
    }
    var lastIndex = index - 1;
    var leftover = scaledt - index;
    if (lastIndex >= 0) {
      this.points.morphTargetInfluences[lastIndex] = 1 - leftover;
    }
    this.points.morphTargetInfluences[index] = leftover;
    this._time = t;
  });

  this.addData = addData;
  this.initClaims = initClaims;
  this.createPoints = createPoints;
  this.renderer = renderer;
  this.scene = scene;

  return this;

};



