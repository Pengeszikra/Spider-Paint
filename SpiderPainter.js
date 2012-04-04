"use strict";
/* 
*	Spider Painter - experiment 3D scene builder  
*
* @author  Peter Vivo // http://fecni.com
*
*/

if(console || console.log) console.log("Spider Painter 0.026");
	
	// based: http://aerotwist.com/tutorials/ten-things-i-learned/
	document.onselectstart = function() {return false;};
	
	var container, stats;
	var camera, scene, projector, renderer;
	var particleMaterial;
	var controls
	var mouseRec = {clientX:0,clientY:0}
	var objects = [];
	var isROT = true
	var OPA = 0.4
	var dumy, pic
	var p1 = false,p2 =false
	var repeatDelay  = 0
	var dd // for debug
	var bushTextMemory,bushMaterial
	var lastinn
	var hero, movings = [], isMoving = true
	
	init();
	animate();	


	function init() {

		container = document.createElement( 'div' );document.body.appendChild( container );
		scene = new THREE.Scene();

		var FOW = 33;
		camera = new THREE.CombinedCamera( window.innerWidth /2, window.innerHeight/2,FOW, 1, 30000, -30000, 30000, 30000 );				
		camera.position.set( 0, 300, 2500 );
		//camera.toOrthographic();
		scene.add( camera );

		projector = new THREE.Projector();
		
		// use WebGLRenderer for better user experience 
		renderer = new THREE.WebGLRenderer( { antialias: false } );
		//renderer.sortObjects = false;
		renderer.setSize( window.innerWidth, window.innerHeight );
		renderer.shadowMapEnabled = true;
		renderer.shadowMapSoft = true;
		
		// light set from: webgl_interactive_draggablecubes.html
		scene.add( new THREE.AmbientLight( 0x505050 ) );
		//scene.add( new THREE.DirectionalLight( 0x505050 ));
		
		var light = new THREE.SpotLight( 0xffffff, 1.5 );
		light.position.set( 0, 500, 2000 );
		light.castShadow = true;

		light.shadowCameraNear = 200;
		light.shadowCameraFar = camera.far;
		light.shadowCameraFov = 50;

		light.shadowBias = -0.00022;
		light.shadowDarkness = 0.5;

		light.shadowMapWidth = 1024;
		light.shadowMapHeight = 1024;
		scene.add( light );	

		
		// objektumoknal, talan ezt kell megadni:
		//  object.material.ambient = object.material.color;
		//	object.castShadow = true;
		//	object.receiveShadow = true;
		
		buildScene()
		
		container.appendChild( renderer.domElement );
		stats = new Stats();stats.domElement.style.position = 'absolute';stats.domElement.style.top = '0px';stats.domElement.style.right='0px';container.appendChild( stats.domElement );
		
		// setup interaction 
		controls = new THREE.EditableControls( camera, renderer.domElement );
		document.addEventListener( 'mousemove',onDocMouseMove, false )
		document.addEventListener('mousedown',onDocMouseDown,false ) 
		window.addEventListener('keydown',onKeyDown, false)
		window.addEventListener('keyup',onKeyUp, false)		
	}		
		
		
	function buildScene(){
		// build scene 
		var geometry = new THREE.CubeGeometry( 100, 100, 100 );
		for ( var i = 0; i < 12; i ++ ) {
			var object = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( { color: Math.random() * 0xffffff, opacity: OPA  } ) ); 

			object.scale.multiplyScalar(Math.random() * 2 + 1);
			shadowed(object)

			if(isROT){
				object.rotation.set( rndArc(360), rndArc(360), rndArc(360) )
			}
			
			addRandom(object,2000)
			
			
			
			
		}
		
		addHero()
		
		var spmsh = new THREE.Mesh ( new THREE.SphereGeometry(300) ,  matRnd()  )
		shadowed(spmsh)
		addRandom(spmsh,2000)
		
		var cygeo =new THREE.CylinderGeometry(0,30,100,5)
		cygeo.applyMatrix( new THREE.Matrix4().setRotationFromEuler( new THREE.Vector3( Math.PI / 2, Math.PI, 0 ) ) ); 

		
		dumy = new THREE.Mesh( cygeo, new THREE.MeshBasicMaterial({wireframe:true,color:0x777777,opacity:0.7}))
		scene.add(dumy)
		
	}
	
	function addHero(){
		new THREE.JSONLoader().load( 'asset/models/1head.js', function ( geo , mat ) {
			geo.computeVertexNormals();		
			//var msh = new THREE.Mesh(geo, matRnd())
			var msh = new THREE.Mesh(geo, matRnd() )
			msh.scale.multiplyScalar(100)
			if(isROT){
				msh.rotation.set( rndArc(360), rndArc(360), rndArc(360) )
			}		
			msh.castShadow = true;
			msh.receiveShadow = true;	
			addRandom(msh,2000)
			hero = msh
		});	
	}
	
	function addRandom(msh,range){
		msh.position.x = THREE.Math.randFloatSpread(range)
		msh.position.y = THREE.Math.randFloatSpread(range)
		msh.position.z = THREE.Math.randFloatSpread(range)	
		scene.add(msh)		
		objects.push(msh)
	}
	
	function matRnd(){
		//return new THREE.MeshBasicMaterial( { color: Math.random() * 0xffffff, opacity: OPA  })
		return new THREE.MeshBasicMaterial( { color: Math.random() * 0xffffff })
	}
	
	
	function onDocMouseDown( event ) {
		//console.log(event)
		//if(event.keyCode != 67) return;
		if(event.altKey){
			event.preventDefault();
			event.stopPropagation();			
			
		var intersects = intersectSurface( event )
		if ( intersects.length > 0 ) {
			var cheight = 70 //100
		    // /////////////////////////////////////////////////////////  WestLangley

		    //radiusTop, radiusBottom, height, segmentsRadius, segmentsHeight, openEnded 
		    var ge3 = new THREE.CylinderGeometry( 0, 200, 70 , 7, 1 );

		    var cu = new THREE.Mesh( ge3 , 
		        new THREE.MeshBasicMaterial( { color: Math.random() * 0xffffff, opacity: OPA } ) 
		        //new THREE.MeshBasicMaterial( { color: Math.random() * 0xffffff } ) 
		    );
			shadowed(cu)
			
			var inn = intersects[0]
			

		    // get the face normal in object space
		    var vec = inn.face.normal.clone();
		    // console.log(vec.x, vec.y, vec.z);

		    // the cone points up 
		    var up = new THREE.Vector3( 0, 1, 0 );

		    // we want the cone to point in the direction of the face normal
		    // determine an axis to rotate around
		    // cross will not work if vec == +up or -up, so there is a special case
		    if ( vec.y == 1 || vec.y == -1 ) {
		        var axis = new THREE.Vector3( 1, 0, 0 );
		    }
		    else {
		        var axis = new THREE.Vector3().cross( up, vec );
		    }

		    // determine the amount to rotate
		    var radians = Math.acos( vec.dot( up ) );

		    // create a rotation matrix that implements that rotation
		    var mat = new THREE.Matrix4().setRotationAxis( axis, radians );

		    // apply the rotation to the cone
		    cu.rotation.getRotationFromMatrix( mat, cu.scale );

		    // set the position of the cone in front of the face centroid in object space
		    // cone height is 100, so offset the position by half of that
		    
			//cu.position = inn.face.centroid.clone().addSelf( inn.face.normal.clone().multiplyScalar(50) );
			//cu.position = inn.face.centroid.clone().addSelf( inn.face.normal.clone().multiplyScalar(cheight/2) );
			
			// alternatively, set the position of the cone in front of the intersection point in object space
			//cu.position = new THREE.Matrix4().getInverse( intersects[0].object.matrixWorld ).multiplyVector3( intersects[0].point.clone() ).addSelf( intersects[0].face.normal.clone().multiplyScalar(cheight/2) );
			cu.position = new THREE.Matrix4().getInverse( intersects[0].object.matrixWorld ).multiplyVector3( intersects[0].point.clone() ).addSelf( intersects[0].face.normal.clone());
			
			//my try
			dd =  {c:inn.face.centroid,p:inn.point,o:inn.object.position}
			var realCentroid =  dd.o ; //inn.matrix.multiplyVector3( inn.face.centroid )   ;
			//draw(dd.p,realCentroid)
	
		    // add the cone as a **child of the object**
		    // the cone will rotate with the object
		    
			inn.object.add(cu);
			//scene.add(cu)
			//cu.position = inn.point;scene.add(cu)
			
		    // /////////////////////////////////////////////////////////             

		    objects.push(cu);
					
			}
		
		}
				
		// delete object 
		
		if(event.ctrlKey){
			var isec = intersectSurface( event )
			if ( isec.length > 0 ) {
				if(p1==false){p1 = isec[0].point} else 
				if(p2==false){
					p2 = isec[0].point
					var mat = new THREE.MeshBasicMaterial({ color:0x888888, opacity:OPA})
					//var cyl = getCylinderBetweenPoints(p1,p2,mat)
					//scene.add(cyl)
					draw(p1,p2,mat)
					p1 = p2 = false
				}
			}
		}
	}
	
	function onDocMouseMove(event){
		mouseRec = event
		var isec = intersectSurface( event )
		if(isec.length > 0){
			lastinn = isec[0].object
			dumy.position = isec[0].point
			dumy.lookAt(isec[0].object.position)
		}
	}
	
	
	function onKeyDown(event){
		repeatDelay --
		if(event.keyCode == 67 && repeatDelay<0){ // C
			var isec = intersectSurface( mouseRec )
			if ( isec.length > 0 ) {
				var ge3 = new THREE.CylinderGeometry( 0, 30, 100, 5 ); // ( 0, 30, 200, 5 );
				ge3.applyMatrix( new THREE.Matrix4().setRotationFromEuler( new THREE.Vector3( Math.PI / 2, Math.PI, 0 ) ) );
				var cu = new THREE.Mesh(ge3, 
						new THREE.MeshBasicMaterial( { color: Math.random() * 0xffffff,opacity: OPA} ) );
						//new THREE.MeshBasicMaterial( { color: Math.random() * 0xffffff} ) );
				cu.position = isec[0].point
				cu.lookAt(isec[0].object.position)
				shadowed(cu)
				scene.add(cu)
				objects.push(cu)
				repeatDelay = 3
			}						
		}
		if(event.keyCode == 88 && repeatDelay<0){ // X
			var isec = intersectSurface( mouseRec )
			if ( isec.length > 0 ) {
				//isec[0].object.visible = !isec[0].object.visible 
				var first = isec[0].object
				scene.remove(first)
				// also remove from intersect list 
				for(var i in objects){  if(objects[i].id == first.id){ objects.splice(i,1);break }  }
				repeatDelay = 0
			}
		}
		//console.log(event.keyCode)
		// http://www.demoscene.hu/trajic/graph/tema6.htm
		if(event.keyCode == 69 && repeatDelay<0){ // E
			var isec = intersectSurface( mouseRec )
			if ( isec.length > 0 ) {
				var icon = bush("asset/textures/levelek.png",200,200)
				//console.log(icon)
				//icon.applyMatrix( new THREE.Matrix4().setRotationFromEuler( new THREE.Vector3( Math.PI / 2, Math.PI, 0 ) ) );
				icon.applyMatrix( new THREE.Matrix4().setRotationFromEuler( 
						new THREE.Vector3( 0  ,  Math.PI/2 , 0 ) ) );
				icon.position = isec[0].point
				icon.position = new THREE.Matrix4().getInverse( isec[0].object.matrixWorld ).multiplyVector3( isec[0].point.clone() ).addSelf( isec[0].face.normal.clone().multiplyScalar(0.2) );
				
				icon.lookAt(isec[0].object.position)
				
				scene.add(icon)
			}
		}
		// http://www.cambiaresearch.com/articles/15/javascript-char-codes-key-codes
		// move camera forward -- bug with controls
		if(event.keyCode == 87){ // W 
			camera.translateZ(-100)
			camera.updateMatrix()
		}
		
		// send object to space!
		if(event.keyCode == 86){ // V
			var isec = intersectSurface( mouseRec )
			if( isec.length > 0){
				isec[0].object.speed = 2 + Math.random()*55
				movings.push( isec[0].object  )
			}
			// movings.push( scene.children[~~(Math.random()*scene.children.length)])
		}
		
		// reset animation
		if(event.keyCode == 82 ){ // R
			for(var i in movings){movings[i].position.set(0,0,0)}
		}
		
		// tick animation
		if(event.keyCode == 84){ // T
			isMoving = !isMoving
		}

		// save as png, but dont work
		// if(event.keyCode == 83 && event.ctrlKey){  window.open( renderer.domElement.toDataURL('image/png'), 'mywindow' ) }
			
	}
	
	function onKeyUp( event ){
		repeatDelay = -1
	}
			
	function intersectSurface(event){
		var vector = new THREE.Vector3( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1, 0.5 );
		projector.unprojectVector( vector, camera );
		var ray = new THREE.Ray( camera.position, vector.subSelf( camera.position ).normalize() );
		return  ray.intersectObjects( objects );	
	}
	
	function bush(imgURL,width,height){ //: Mesh
		// possible to crawl size from image name
		width = width || 128
		height = height || 128

		if(imgURL != bushTextMemory ){
			var img = new THREE.ImageUtils.loadTexture(imgURL)
			bushMaterial= new THREE.MeshLambertMaterial( { map: img, transparent: true, depthWrite: false } )
			bushTextMemory = imgURL
		} 
		
		var bs = new THREE.Mesh( new THREE.PlaneGeometry(width,height),  bushMaterial )
		bs.doubleSided = true
		return bs
	}	

	// KIHAL a draw 고a connect nagyon hasznos a 3D debugban!! 
	// kihal legel⣢ 2 pontot 紳ze tudok k絮i mⲠez is valami
	function draw(p1,p2){
		var mat = new THREE.LineBasicMaterial({color:0x884488,opacity:0.4})
		var geo = new THREE.Geometry()
		geo.vertices.push( new THREE.Vertex(p1) )
		geo.vertices.push( new THREE.Vertex(p2) )
		var line = new THREE.Line(geo)
		scene.add(line)
		return line
	}
	
	// two object lookAt each other and draw line between
	function connect(a,b){
		a.lookAt(b.position)
		b.lookAt(a.position)
		draw(a.position,b.position)
	}
	
	function move(po,dir,speed){} // translate-nak hivjak
	
	// Mesh goes to shadow reciver
	function shadowed(msh){
		if(msh.material != undefined){
			msh.material.ambient = msh.material.color;
		}
		msh.castShadow = true;
		msh.receiveShadow = true;	
	}

	function animate() {
		requestAnimationFrame( animate );
		
		if(isMoving){
			for(var i in movings){
				movings[i].translateZ(movings[i].speed)
				if(Math.random()>0.98)
					
					//movings[i].rotation.set( rndArc(360), rndArc(360), rndArc(360) )
					movings[i].rotation.set( rndArc(20), rndArc(20), rndArc(20) )
			}
		}
		
		render();
		stats.update();
	}
	
	function rndArc(sector){return Math.random() * sector * Math.PI/(sector/2) }
	
	//  http://stackoverflow.com/questions/3809788/3d-rotation-with-axis-angle
	// normalized means length is 1 
	//object, normalized direction vector, rotation in radians
function align(target, dir, rot) {
    //Three.js uses a Y up coordinate system, so the cube inits with this vector
    var up = new THREE.Vector3(0, 1, 0);

    //euler angle between direction vector and up vector
    var angle = Math.acos(up.dot(dir));

    //cross product of the up vector and direction vector
    var axis = new THREE.Vector3();
    axis.cross(up, dir);
    axis.normalize();

    //rotation to aligns the target with the direction vector
    var rotate = THREE.Matrix4.rotationAxisAngleMatrix(axis, angle);

    //rotation around direction vector
    var revolve = THREE.Matrix4.rotationAxisAngleMatrix(dir, rot);

    //compose the rotations (order matters, can be done other ways)
    revolve.multiplySelf(rotate);

    //assign matrix (autoUpdateMatrix = false)
    target.matrix = revolve;
}

function render() {
	controls.update()
	renderer.render( scene, camera );
}

/*

mindenki a kamera iranyaba nez:

for(var i=3;i<scene.children.length;i++){scene.children[i].lookAt(camera.position)}


a hero random targy fele mozog:

hero.lookAt(scene.children[~~(Math.random()*scene.children.length)].position) // ~~ -- kerekítés lefelé
var ani = setInterval(function(){hero.translateZ(10)},100)
clearInterval(ani)  // stop





*/
	
