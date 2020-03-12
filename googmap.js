class GoogMap {
	
	constructor(elm,defloc,context){
		// this.edinburghBounds = new Microsoft.Maps.LocationRect.fromLocations(new Microsoft.Maps.Location(56.030833, -3.458838), new Microsoft.Maps.Location(55.818353, -3.054412));
		this.edinburghBounds = new google.maps.LatLngBounds(
								new google.maps.LatLng(55.818353, -3.458838), // sw
								new google.maps.LatLng(56.030833, -3.054412) // ne
							);
		
		var styledMapType = new google.maps.StyledMapType(mapStyle,
            {name: 'Styled Map'});
			
		var gmapStyle = [ 
	  { featureType: "poi", elementType:"labels", stylers: [{ visibility: "off" }] },
	  { featureType: "transit", elementType:"all", stylers: [{visibility:"off"}]}, // remove water routes
	  // { featureType: "transit.station", elementType:"labels", stylers:[{visibility:"off"}]},
	  { featureType: "all", elementType: "all", stylers: [ { lightness: 43 }, { gamma: 0.8 }, { saturation: -91 } ] },
	  { featureType: "road.local", elementType: "geometry", stylers: [ { saturation: -73 }, { lightness: 33 }, { gamma: 0.8 }, { visibility: "simplified" } ] },
	  { featureType: "road.arterial", elementType: "geometry", stylers: [ { saturation: -91 }, { gamma: 0.8 }, { visibility: "simplified" }, { lightness: 100 } ] },
	  { featureType: "road.arterial", elementType: "labels", stylers: [ { visibility: "off" } ] },
	  { featureType: "road.highway", elementType: "geometry", stylers: [ { visibility: "simplified" }, { saturation: -91 }, { gamma: 0.8 }, { lightness: 94 } ] },
	  { featureType: "road.highway", elementType: "labels", stylers: [ { visibility: "off" } ] },
	  { featureType: "landscape.man_made", elementType: "geometry", stylers: [ { visibility: "simplified" }, { gamma: 0.76 } ] } // turn off 3d buildings
	  ];
		var hurriStyle = new google.maps.StyledMapType(mapStyle, {name:'hurri'});
		
		this.defloc = defloc;
		this.map = new google.maps.Map(elm, {
			center: {lat: 55.94265, lng: -3.188046 },
			zoom: 11,
			streetViewControl: false,
			zoomControl: true,
			zoomControlOptions: {
				style: google.maps.ZoomControlStyle.SMALL
			},
			minZoom:10,
			maxZoom:18,
			mapTypeControl: false,
			mapTypeControlOptions: {
			  style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
			  mapTypeIds: ['roadmap', 'satellite', 'hybrid', 'terrain',
						'styled_map']
			},
			gestureHandling: 'greedy'
		});
		
		this.map.mapTypes.set('styled_map', hurriStyle);
		this.map.setMapTypeId('styled_map');
		
		
		this.clusterLayer;
		this.heatLayer;
		this.userPin;
		this.userCircle;
		this.markers = {};
		this.context = context;
	}
	
	withinBounds = function(lat, lng){
		if(this.edinburghBounds.contains(new google.maps.LatLng(lat,lng))){
			return true;
		}
		return false; // unlucky
	}
	
	polyContains = function(poly, lat, lng){
		return google.maps.geometry.poly.containsLocation( new google.maps.LatLng(lat, lng),poly)
	}
	
	userCircleBounds = function(){
		if(this.userCircle != null){
			var bounds = this.userCircle.getBounds();
			var ne = bounds.getNorthEast();
			var sw = bounds.getSouthWest();
			return {
				'sw' :  {'lat':sw.lat(), 'lng':sw.lng()},
				'ne' :  {'lat':ne.lat(), 'lng':ne.lng()},
			};
		}
		return false;
	}
	
	updateUserCircleLocation(loc){
		this.userCircle.setCenter(new google.maps.LatLng(parseFloat(loc.lat()),parseFloat(loc.lng())));
	}
	
	createUserCircle(lat,lng){
		if(this.userCircle == null){
			var loc = new google.maps.LatLng(lat,lng);
			
			//Create an accuracy circle
			this.userCircle = new google.maps.Circle({
				strokeColor: '#FF0000',
				strokeOpacity: 0.1,
				strokeWeight: 5,
				// fillColor: '#FA0000',
				fillOpacity: 0,
				map: this.map,
				center: loc,
				radius: 250 // meters, "0-450 feet (150 metres)" accurate?
			});

			var moptions = {
				map: this.map,
				position: loc,
				title: "Your location",
				draggable: true
			}
			
			this.userPin = new google.maps.Marker(moptions);
			
			google.maps.event.addListener(this.userPin, 'dragend',
				function(m, i) {
					console.log(this);
					updateUserCircle(this.position);
				}
			);

			//Center the map on the user's location.
			var bounds = new google.maps.LatLngBounds();
			bounds.extend(loc);
			google.maps.event.addListenerOnce(map, 'bounds_changed', function() {
				this.setZoom(Math.min(18, this.getZoom()));
			});
			
			this.map.fitBounds(bounds);
		}
		return true;
	}
	
	clearPolyArea(poly){
		if(poly != null){
			poly.setOptions({strokeThickness:0, visible: false});
		}
	}
	
	updatePoly(poly,opacity){
		if(poly != null){
			// poly.setOptions({visible: true, strokeThickness:1, fillColor: 'rgba(255,0,0,'+opacity+')'});
			poly.setOptions({visible: true, strokeThickness:1, fillColor: 'red', fillOpacity: opacity});
		}
	}
	
	createPolyArea(coords,opacity,id,poly){
		var polygon = new google.maps.Polygon({
		  paths: coords,
		  strokeColor: '#FF0000',
		  strokeOpacity: 0.3,
		  strokeWeight: 1,
		  fillColor: 'red',
		  fillOpacity: opacity,
		  id: id
		});
		polygon.setMap(this.map);
		polygon.addListener('click', function(e){showMarkers(this.id); });
		
		return polygon;
	}
	
	clearHeatLayer = function(){
		if(this.heatLayer != null){
			this.heatLayer.setMap(null);
		}
	}
	
	createHeatMap(pinlist,listings,weighted=true){
		if(this.clusterLayer != null){
			this.clearMarkers();
		}
		
		var loclist = this.getWeightedList(pinlist,listings,weighted);
		
		//Load the HeatMap module.
		if(this.heatLayer == null){
			this.heatLayer = new google.maps.visualization.HeatmapLayer(
				{
					data: loclist,
					radius: (weighted?10:8),
					map:this.map
				}
			);
		}
		else{
			this.heatLayer.setOptions(
				{
					data: loclist,
					radius: (weighted?10:8),
					map:this.map
				}
			);
		}
	}
	
	getWeightedList(pinlist,listings,weighted=true){
		var loclist = [];
		$.each(pinlist, function(j, lid){
			if(weighted){
				loclist.push({location: new google.maps.LatLng(listings[lid].latitude, listings[lid].longitude), weight: parseInt(listings[lid].reviews_per_month)});
			}
			else{
				loclist.push(new google.maps.LatLng(listings[lid].latitude, listings[lid].longitude));
			}
		});
		return loclist;
	}

	createAndAddPins(pinlist, cluster=true){
		if(cluster){
			if(this.clusterLayer == null){
				this.clusterLayer = new MarkerClusterer(this.map, Object.values(pinlist),{
					maxZoom: 16,
					gridSize: 40, //60
					minimumClusterSize: 3, //2
					// styles: styles[style],
					imagePath: './images/m'}
				);
			}
			else{
				this.clusterLayer.addMarkers(Object.values(pinlist));
			}
		}
	}
	
	setCluster = function(bool){
		// if(bool == false){
			this.clearMarkers();
		// }
	}

	createPin = function(pid, position, name, color, scale, opacity){
		if(this.markers[pid] == null){
			// var minRadius = (mobile)? 2 : 1;
			var minRadius = 0.5;
			var radius = Math.min((1.5 * scale) + minRadius, 4);
			// console.log(scale + " " + radius);
			var moptions = {
				// id: pid,
				pid: pid,
				map: this.map,
				position: {lat: parseFloat(position.lat), lng: parseFloat(position.lng)},
				title: name,
				icon: this.pinSymbol(color,radius)
			}
			
			var marker = new google.maps.Marker(moptions);
			marker.setOpacity(opacity);
			
			google.maps.event.addListener(marker, 'click',
				function(e) {
					console.log(this);
					if(this.pid){
						// this.context.pinClicked(e.target);
						console.log("pin click");
						pinClicked(this.pid);
					}
				}
			);
			
			this.markers[pid] = marker;
			return marker;
		}
		
		// set visible and opaque?
		
		return this.markers[pid];
	}
	

	pinSymbol = function(color,scale=0.5) {
		return {
			// path: 'M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z M -2,-30 a 2,2 0 1,1 4,0 2,2 0 1,1 -4,0',
			// path: 'M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z',
			path: 'M 10, 10  m -7.5, 0  a 7.5,7.5 0 1,0 15,0  a 7.5,7.5 0 1,0 -15,0',
			labelOrigin: new google.maps.Point(1,-30),
			fillColor: 'rgb('+color+')',
			fillOpacity: 1,
			strokeColor: '#fff',
			strokeWeight: 2,
			scale: scale,
	   };
	}
	
	changePinColors = function(pids, color){
		var activeLayer = (this.clusterLayer != null? this.clusterLayer : null);
		var targetPins = [];
		
		var targetMarkers = (activeLayer == null ? this.markers : activeLayer.getMarkers());
		$.each(targetMarkers, function(i, pin){
			if(pids.indexOf(parseInt(pin.pid.substring(pin.pid.indexOf('_')+1))) > -1){
				targetPins.push(pin);
			}
		});
		
		$.each(targetPins, function(i,targetPin){
			var colors = {'blue':'#9b9bf9', 'pink':'#fc91cc', 'green':'#b8ff5a', 'orange':'#ffc251'};
			// targetPin.setOptions({color: colors[color]});
			
			var tmpi = targetPin.getIcon();
			tmpi.fillColor = colors[color];
			targetPin.setIcon(tmpi);
			// var svgcol = targetPin._options.icon.split('fill="');
			// svgcol = svgcol[0] + 'fill="{color}'+ svgcol[1].substring(svgcol[1].indexOf('"')); 
			// console.log(svgcol);
			// targetPin._options.icon = svgcol;
		
			// push to top?
			// activeLayer.remove(targetPin);
			// activeLayer.add(targetPin,0);
		});
	}
	
	changePinColor = function(pid, color){
		var activeLayer = (this.clusterLayer != null? this.clusterLayer : null);
		var targetMarkers = (activeLayer == null ? this.markers : activeLayer.getMarkers());
		var targetPin;
		$.each(targetMarkers, function(i, pin){
			if(pin.pid == 'pin_'+pid){
				targetPin = pin;
				return true;
			}
		});
		
		if(targetPin){
			var colors = {'blue':'#9b9bf9', 'pink':'#fc91cc', 'green':'#b8ff5a', 'orange':'#ffc251'};
			targetPin.setOptions({color: colors[color]});
			
			var svgcol = targetPin._options.icon.split('fill="');
			// svgcol = svgcol[0] + 'fill="'+ colors[color] + svgcol[1].substring(svgcol[1].indexOf('"')); 
			svgcol = svgcol[0] + 'fill="{color}'+ svgcol[1].substring(svgcol[1].indexOf('"')); 
			console.log(svgcol);
			targetPin._options.icon = svgcol;
		}
		
		/*
		// markers[ids[i]].icon.color = 'green';
		var tmpi = markers[ids[i]].getIcon();
		var colors = {'blue':'#9b9bf9', 'pink':'#fc91cc', 'green':'#b8ff5a', 'orange':'#ffc251'};
		tmpi.fillColor = colors[color];
		markers[ids[i]].setIcon(tmpi);
		*/
	}
	
	
	clearMarkers = function(){
		if(this.clusterLayer != null){
			// this.map.layers.remove(this.clusterLayer);
			// remove click handler?
			this.clusterLayer.clearMarkers();
		}
		$.each(this.markers, function(i,v){
			v.setMap(null);
		});
		
		this.markers = {};
		this.clusterLayer = null;
	}
	
	
	getZoom = function(){
		return this.map.getZoom();
	}
	
	mapFitBound = function(mid){
		// find a pushpin with a specific id?
		var activeLayer = (this.clusterLayer != null? this.clusterLayer : null);
		var targetMarkers = (activeLayer == null ? this.markers : activeLayer.getMarkers());
		var findLoc;
		$.each(targetMarkers, function(i, pin){
			// loclist.push(pin.getLocation());
			if(pin.pid == 'pin_'+mid){
				findLoc = pin.getPosition();
				return;
			}
		});
		
		if(findLoc != null){
			var bounds = new google.maps.LatLngBounds();
			bounds.extend(findLoc);
			google.maps.event.addListenerOnce(map, 'bounds_changed', function() {
				this.setZoom(Math.min(15, this.getZoom()));
			});
			
			this.map.fitBounds(bounds);
		}
	}
	
	
	
	mapFitBounds = function(dontzoomout=false){
		var activeLayer = (this.clusterLayer != null? this.clusterLayer : null);
		var targetMarkers = (activeLayer == null ? this.markers : activeLayer.getMarkers());
		if(targetMarkers != null && Object.keys(targetMarkers).length > 0){
			var bounds = new google.maps.LatLngBounds();
			$.each(targetMarkers, function(i,v){
				bounds.extend(v.getPosition());
			}
			);
			google.maps.event.addListenerOnce(map, 'bounds_changed', function() {
				// if(dontzoomout){
					// this.setZoom(prevzoom);
				// }
				// else{
					this.setZoom(Math.min(15, this.getZoom()));
				// }
			});
			
			this.map.fitBounds(bounds);
		}
	}
	
}

// = new BingMap();