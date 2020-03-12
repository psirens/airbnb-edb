class BingMap {
	
	constructor(elm,defloc,context){
		this.edinburghBounds = new Microsoft.Maps.LocationRect.fromLocations(new Microsoft.Maps.Location(56.030833, -3.458838), new Microsoft.Maps.Location(55.818353, -3.054412));
		this.map = new Microsoft.Maps.Map(elm,
		{
            center: new Microsoft.Maps.Location(defloc.lat, defloc.lng),
            mapTypeId: Microsoft.Maps.MapTypeId.road,
            zoom: 12,
			minZoom:11,
			maxZoom:20,
			maxBounds: this.edinburghBounds,
			
			showLocateMeButton: false,
			showMapTypeSelector: false,
			showScalebar: false,
			disableStreetside: true,
			disableStreetsideAutoCoverage: true,
			// showTermsLink: false, // (bottom page?)
			
        });
		
		var boundsBorder = new Microsoft.Maps.Polyline([
			this.edinburghBounds.getNorthwest(),
			new Microsoft.Maps.Location(this.edinburghBounds.getNorthwest().latitude, this.edinburghBounds.getSoutheast().longitude),
			this.edinburghBounds.getSoutheast(),
			new Microsoft.Maps.Location(this.edinburghBounds.getSoutheast().latitude, this.edinburghBounds.getNorthwest().longitude),
			this.edinburghBounds.getNorthwest()], { strokeColor: '#cccccc', strokeThickness: 1 });
		this.map.entities.push(boundsBorder);

		// this.markers = {};
		// this.method = 'area'; // all, clustering
		this.clusterLayer;
		this.heatLayer;
		this.userPin;
		this.userCircle;
		this.context = context;
		
        Microsoft.Maps.loadModule(['Microsoft.Maps.HeatMap', 'Microsoft.Maps.SpatialMath', 'Microsoft.Maps.Clustering','Microsoft.Maps.GeoJson'], function () {
            // ready to cluster
            //Create a ClusterLayer and add it to the map.
            // clusterLayer = new Microsoft.Maps.ClusterLayer();
            // map.layers.insert(clusterLayer);
        });
	}
	
	withinBounds = function(lat, lng){
		if(this.edinburghBounds.contains(new Microsoft.Maps.Location(lat,lng))){
			return true;
		}
		return false; // unlucky
	}
	
	polyContains = function(poly, lat, lng){
		var loc = new Microsoft.Maps.Location(lat,lng);
		
		var loclist = poly.getLocations();
		var boundsrect = new Microsoft.Maps.LocationRect.fromLocations(loclist);
		
		return boundsrect.contains(loc);
	}
	
	userCircleBounds = function(){
		if(this.userCircle != null){
			var loclist = this.userCircle.getLocations();
			var boundsrect = new Microsoft.Maps.LocationRect.fromLocations(loclist);
			return {
				'sw' :  {'lat':boundsrect.getSouth(), 'lng':boundsrect.getWest()},
				'ne' :  {'lat':boundsrect.getNorth(), 'lng':boundsrect.getEast()},
			};
		}
		return false;
	}
	
	updateUserCircleLocation(loc){
		this.userCircle.setLocations(Microsoft.Maps.SpatialMath.getRegularPolygon(loc, 275, 30,  Microsoft.Maps.SpatialMath.Meters));
	}
	
	createUserCircle(lat,lng){
		if(this.userCircle == null){
			var loc = new Microsoft.Maps.Location(lat,lng);

			//Create an accuracy circle
			var path = Microsoft.Maps.SpatialMath.getRegularPolygon(loc, 275, 30,  Microsoft.Maps.SpatialMath.Meters);
			this.userCircle = new Microsoft.Maps.Polygon(path);
			
			var minRadius = (mobile)? 5 : 3;
			
			//Add a pushpin at the user's location.
			this.userPin = new Microsoft.Maps.Pushpin(loc, {
				draggable:true
			});
			Microsoft.Maps.Events.addHandler(this.userPin, 'dragend',  function(e) {
				updateUserCircle(e.target.getLocation());
			});
			this.map.entities.push(this.userPin);
			
			this.map.entities.push(this.userCircle);

			//Center the map on the user's location.
			this.map.setView({ center: loc, zoom: 17 });
		}
		return true;
	}
	
	clearPolyArea(poly){
		if(poly != null){
			// this.map.entities.remove(area);
			// poly.setOptions({fillColor: 'rgba(255,0,0,0)'});
			poly.setOptions({strokeThickness:0, visible: false});
		// baketrix.areas[i].poly.setMap(null);
		}
	}
	
	updatePoly(poly,opacity){
		if(poly != null){
			poly.setOptions({visible: true, strokeThickness:1, fillColor: 'rgba(255,0,0,'+opacity+')'});
		}
	}
	
	createPolyArea(coords,opacity,id,poly){
		var shape = [];
		$.each(coords, function(i, c){
			shape.push(new Microsoft.Maps.Location(c.lat, c.lng));
		});
		
		var polygon = new Microsoft.Maps.Polygon(shape, {
            fillColor: 'rgba(255, 0, 0, '+opacity+')',
            strokeColor: 'red',
            strokeThickness: 1
        });
		this.map.entities.push(polygon);
		
		Microsoft.Maps.Events.addHandler(polygon, 'click', function () { console.log("clicked " + id); showMarkers(id); });
		return polygon;
	}
	
	clearHeatLayer = function(){
		if(this.heatLayer != null){
			this.map.layers.remove(this.heatLayer);
			// this.heatLayer.clear();
			// this.heatLayer.dispose();
		}
	}
	
	createHeatMap(pinlist,listings,weighted=true){
		if(this.clusterLayer != null){
			this.clearMarkers();
		}
		
		var loclist = this.getWeightedList(pinlist,listings,weighted);
       
		//Load the HeatMap module.
		if(this.heatLayer != null){
			this.heatLayer.clear();
			this.heatLayer.dispose();
		}
		// if(this.heatLayer == null){
			if(weighted){
				var geojson = new Microsoft.Maps.GeoJson.read(loclist);
				// console.log(geojson);
				this.heatLayer = new Microsoft.Maps.HeatMapLayer(geojson, { intensity:1, opacity: 1.0, radius: 8, unit: 'pixels', propertyAsWeight: 'avgreviews' });
			}
			else{
				this.heatLayer = new Microsoft.Maps.HeatMapLayer(loclist, {
						intensity: 0.4,
						opacity: 1.0,
						// aggregateLocationWeights:true,
						// radius: 450,
						// unit: 'meters'
						radius: 5,
						unit: 'pixels'
				});
			}
		// }
		// else{
			// this.heatLayer.setLocations(loclist);
		// }
        
		this.map.layers.insert(this.heatLayer);	
	}
	
	getWeightedList(pinlist,listings,weighted=true){
		var loclist = [];
		
		$.each(pinlist, function(j, lid){
			if(weighted){
				// loclist.push({location: new google.maps.LatLng(listings[lid].latitude, listings[lid].longitude), weight: parseInt(listings[lid].reviews_per_month)});
				loclist.push({
					'type': 'Feature',
					'properties': {
						'avgreviews': parseInt(listings[lid].reviews_per_month) - 0 / 18-0, // normalize?
					},
					'geometry': {
						"type": "Point",
						"coordinates": [listings[lid].longitude, listings[lid].latitude]
						// "x": listings[lid].latitude, 
						// "y": listings[lid].longitude, 
					},
					'id': lid
				});
			}
			else{
				loclist.push(new Microsoft.Maps.Location(listings[lid].latitude, listings[lid].longitude));
			}
		});
		
		if(weighted){
			var out = {
				"type": "FeatureCollection"
			};
			out['features'] = loclist;
			
			return  JSON.stringify(out);
			// return out;
		}
		else{
			return loclist;
		}
	}

	createAndAddPins(pinlist, cluster=true){
		// if(this.method == 'area'){
			// clusterLayer = new Microsoft.Maps.ClusterLayer(createCustomPushpins(100), {
                // clusteredPinCallback: createCustomClusterPushpins,
                // callback: createPushpinList
            // });
			if(this.clusterLayer == null){
				this.clusterLayer = new Microsoft.Maps.ClusterLayer(pinlist, {
					clusteredPinCallback: this.styleClusters,
					gridSize: 40,
					clusteringEnabled: cluster
				});
				this.map.layers.insert(this.clusterLayer);	// only once ?
			
				//Add click event to cluster layer
				Microsoft.Maps.Events.addHandler(this.clusterLayer, 'click',  function(e) {
					console.log(e);
					if (e.target.containedPushpins) {
						var locs = [];
						for (var i = 0, len = e.target.containedPushpins.length; i < len; i++) {
							//Get the location of each pushpin.
							locs.push(e.target.containedPushpins[i].getLocation());
						}

						//Create a bounding box for the pushpins.
						var bounds = Microsoft.Maps.LocationRect.fromLocations(locs);

						//Zoom into the bounding box of the cluster. 
						//Add a padding to compensate for the pixel area of the pushpins.
						var prevzoom_level = e.layer._map.getZoom();
						e.layer._map.setView({ bounds: bounds, padding: 100 });
						
						// check we actually zoomed? sometimes it doesn't zoom in because the bound coords are too similar to current
						// var newzoom_level = e.layer._map.getZoom();
						// var zoomlimits = e.layer._map.getZoomRange();
						// if(newzoom_level <= prevzoom_level && zoomlimits.max > newzoom_level){
							// e.layer._map.setView({ bounds: bounds, padding: 100 });
						// }
						
						var newzoom_level = e.layer._map.getZoom();
						var zoomlimits = e.layer._map.getZoomRange();
						var newcenter = e.target.getLocation();
						
						if(newzoom_level <= prevzoom_level && zoomlimits.max > newzoom_level){
							e.layer._map.setView({center:newcenter, zoom:prevzoom_level+1});
						}
					}
					else if(e.target.pid){
						// this.context.pinClicked(e.target);
						pinClicked(e.target.pid);
					}
				});
			}
			else{
				
				
				
				// concat or not ?? clear first when necessary?
				
				
				
				// this.clusterLayer.setPushpins(this.clusterLayer.getPushpins().concat(pinlist));
				this.clusterLayer.setPushpins(pinlist);
				
				
				
				
				
				
				
				
			}
			
		// }
	}
	
	styleClusters = function(cluster){
		//Define variables for minimum cluster radius, and how wide the outline area of the circle should be.
	    var minRadius = 8;
	    var outlineWidth = 6;

        //Get the number of pushpins in the cluster
	    var clusterSize = cluster.containedPushpins.length;

        //Calculate the radius of the cluster based on the number of pushpins in the cluster, using a logarithmic scale.
	    var radius = Math.log(clusterSize) / Math.log(10) * 5 + minRadius;

        //Default cluster color is red.
	    var fillColor = 'rgba(255, 40, 40, 0.5)';

	    if (clusterSize < 10) {
	        //Make the cluster blue if there are less than 10 pushpins in it.
	        fillColor = 'rgba(0, 123, 255, 0.5)';
	    } else if (clusterSize < 100) {
	        //Make the cluster yellow if there are 10 to 99 pushpins in it.
	        fillColor = 'rgba(255, 210, 40, 0.5)';
	    }
		
		// this isn't actually relevant because it doesn't use the cluster styler for single pins, style the initial createPin
		var outerring = (clusterSize < 2) ? '' : '<circle cx="'+radius+'" cy="'+radius+'" r="'+radius+'" fill="'+fillColor+'"/>';

	    //Create an SVG string of two circles, one on top of the other, with the specified radius and color.
	    var svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="', (radius * 2), '" height="', (radius * 2), '">',
            outerring,
            '<circle cx="', radius, '" cy="', radius, '" r="', radius - outlineWidth, '" fill="', fillColor, '"/>',
            '</svg>'];
			
	    //Customize the clustered pushpin using the generated SVG and anchor on its center.
	    cluster.setOptions({
	        icon: svg.join(''),
	        anchor: new Microsoft.Maps.Point(radius, radius),
	        textOffset: new Microsoft.Maps.Point(0, radius - 8) //Subtract 8 to compensate for height of text.
	    });
	}
	
	setCluster = function(bool){
		if(this.clusterLayer != null){
			this.clusterLayer.setOptions({clusteringEnabled:bool});
		}
	}

	createPin = function(pid, position, name, color, scale, opacity){
		var loc = new Microsoft.Maps.Location(position.lat, position.lng);
		
	    var minRadius = (mobile)? 5 : 3;
		var radius = minRadius + (scale * minRadius * 2);
		
		var svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="', (radius * 2), '" height="', (radius * 2), '">',
            '<circle cx="', radius, '" cy="', radius, '" r="', radius , '" fill="{color}" opacity="'+opacity+'" />',
            '</svg>'];
		
		// var colors = {'blue':'#9b9bf9', 'pink':'#fc91cc', 'green':'#b8ff5a', 'orange':'#ffc251'};
		var pin = new Microsoft.Maps.Pushpin(loc, {
			color: 'rgb('+color+')',
			// color: colors[color],
			anchor: new Microsoft.Maps.Point(radius,radius),
			icon: svg.join(''),
			// title: name,
			subTitle: name,
			roundClickableArea: true
		});
		// var pin2 = new Microsoft.Maps.Pushpin(loc, {
			// color: 'rgb('+color+')',
			// subTitle: name,
			// roundClickableArea: true
		// });
		/*
		// var co = new Microsoft.Maps.Color(150, 0, 255, opacity);
		var pin = new Microsoft.Maps.Pushpin(loc, {
			color: 'rgba('+color+','+opacity+')',
			// title: name,
			subTitle: name,
			roundClickableArea: true
			// text: '1' // text "value"
		});*/
		pin.pid = pid;
		// pin2.pid = pid;
		
		// return [pin,pin2];
		return pin;
	}
	
	changePinColors = function(pids, color){
		var activeLayer = (this.clusterLayer != null? this.clusterLayer : null);
		var targetPins = [];
		if(activeLayer != null){
			$.each(activeLayer.getPushpins(), function(i, pin){
				if(pids.indexOf(parseInt(pin.pid.substring(pin.pid.indexOf('_')+1))) > -1){
					targetPins.push(pin);
				}
			});
		}
		
		$.each(targetPins, function(i,targetPin){
			var colors = {'blue':'#9b9bf9', 'pink':'#fc91cc', 'green':'#b8ff5a', 'orange':'#ffc251'};
			targetPin.setOptions({color: colors[color]});
			
			var svgcol = targetPin._options.icon.split('fill="');
			// svgcol = svgcol[0] + 'fill="'+ colors[color] + svgcol[1].substring(svgcol[1].indexOf('"')); 
			svgcol = svgcol[0] + 'fill="{color}'+ svgcol[1].substring(svgcol[1].indexOf('"')); 
			console.log(svgcol);
			targetPin._options.icon = svgcol;
		
			// push to top?
			activeLayer.remove(targetPin);
			activeLayer.add(targetPin,0);
		});
	}
	
	changePinColor = function(pid, color){
		var activeLayer = (this.clusterLayer != null? this.clusterLayer : null);
		var targetPin;
		$.each(activeLayer.getPushpins(), function(i, pin){
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
		
		// push to top?
		activeLayer.remove(targetPin);
		activeLayer.add(targetPin,0);
	}
	
	
	clearMarkers = function(){
		if(this.clusterLayer != null){
			this.map.layers.remove(this.clusterLayer);
			// remove click handler?
			this.clusterLayer.clear();
			this.clusterLayer.dispose();
		}
		this.clusterLayer = null;
		// this.markers = {};
	}
	
	
	getZoom = function(){
		return this.map.getZoom();
	}
	
	mapFitBound = function(mid){
		// find a pushpin with a specific id
		var activeLayer = (this.clusterLayer != null? this.clusterLayer : null);
		var findLoc;
		$.each(activeLayer.getPushpins(), function(i, pin){
			if(pin.pid == 'pin_'+mid){
				// findLoc = [pin.getLocation()];
				findLoc = pin.getLocation();
				return;
			}
		});
		
		if(findLoc != null){
			// var boundsrect = new Microsoft.Maps.LocationRect.fromLocations(findLoc);
			// this.map.setView({bounds: boundsrect, padding: 200 });	// if the view touches an out of bounds marker it zooms all the way out?
			this.map.setView({center:findLoc, zoom:17});
		}
	}
	
	mapFitBounds = function(dontzoomout=false){
		var loclist = [];
		var activeLayer = (this.clusterLayer != null? this.clusterLayer : null);
		
		if(activeLayer != null){
			$.each(activeLayer.getPushpins(), function(i, pin){
				// bounds extend to include v position 
				loclist.push(pin.getLocation());
			});
			// zoom map out to cover bounds
			var boundsrect = new Microsoft.Maps.LocationRect.fromLocations(loclist);
			
			
			var prevzoom_level = this.getZoom();
			// this is fucking zooming out all over the place 
			this.map.setView({bounds: boundsrect }); //, padding: 100
			
			// var newzoom_level = this.getZoom();
			// var zoomlimits = this.map.getZoomRange();
			// if(newzoom_level <= prevzoom_level && zoomlimits.max > newzoom_level){
				// this.map.setView({center:this.map.getCenter(), zoom:newzoom_level+1});
			// }
		}
	}
	
}

// = new BingMap();