/* =========================================================
   TAHSILDAR — GIS MAP ENGINE (v2.0)
   Leaflet Core, High-Res Cadastre, Dynamic Search & Workflows
   Department of Land Resources (DoLR) • Govt of Andhra Pradesh
   ========================================================= */

(function(window) {
    'use strict';

    const MapEngine = {
        map: null,
        baseLayers: {},
        overlayLayers: {},
        cadastreLayer: null,
        waterLayer: null,
        powerLayer: null,
        crzLayer: null,
        activeHighlightLayer: null,
        allParcels: [],
        parcelFeatureMap: {},
        currentMyPropIndex: -1,

        init: function() {
            // Center of Rushikonda / Madhurawada Pilot Cadastre
            this.map = L.map('map', {
                center: [17.7830, 83.3810],
                zoom: 16,
                maxZoom: 22,
                zoomControl: false,
                attributionControl: false
            });

            // Zoom control at top-right
            L.control.zoom({ position: 'topright' }).addTo(this.map);

            // 1. Base Tile Providers (Default to Google High-Res Satellite)
            this.baseLayers.satellite = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                maxZoom: 22,
                maxNativeZoom: 20,
                attribution: '© Google Satellite'
            }).addTo(this.map);

            this.baseLayers.esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: 'Tiles © Esri'
            });

            this.baseLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 20,
                attribution: '© CartoDB'
            });

            this.baseLayers.streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap'
            });

            this.activeBaseLayer = this.baseLayers.satellite;

            // 2. Load Real Cadastre Layer (256 Parcels via API with local fallback)
            this.loadCadastreParcels();

            // 3. Load Infrastructure Overlays (Water, Power Grid, CRZ)
            this.loadInfrastructureLayers();

            // 4. Bind Mouse Telemetry HUD
            this.bindTelemetryEvents();

            // 5. Connect Search & Filter
            this.bindSearchAndFilters();

            // 6. Handle Auto-Locate on Login (for Citizen)
            this.checkAutoLocate();
        },

        loadCadastreParcels: async function() {
            const self = this;
            let geojsonData = window.PARCELS_GEOJSON;

            try {
                if (window.ApiService && window.ApiService.parcels) {
                    const apiData = await window.ApiService.parcels.getGeoJson();
                    if (apiData && apiData.features && apiData.features.length > 0) {
                        geojsonData = apiData;
                    }
                }
            } catch (e) {
                console.warn('[MapEngine] Using preloaded parcels GeoJSON');
            }

            if (!geojsonData || !geojsonData.features) {
                console.warn('[MapEngine] No parcels data available');
                return;
            }

            this.allParcels = geojsonData.features;

            // Build parcel feature index
            geojsonData.features.forEach(f => {
                if (f.properties && f.properties.id) {
                    self.parcelFeatureMap[f.properties.id] = f;
                    if (f.properties.ulpin) {
                        self.parcelFeatureMap[f.properties.ulpin.toUpperCase().trim()] = f;
                    }
                }
            });

            if (this.cadastreLayer) {
                this.map.removeLayer(this.cadastreLayer);
            }

            this.cadastreLayer = L.geoJSON(geojsonData, {
                style: function(feature) {
                    return self.getParcelStyle(feature.properties);
                },
                onEachFeature: function(feature, layer) {
                    const p = feature.properties;
                    // Tooltip on hover
                    layer.bindTooltip(`
                        <div style="font-size:0.75rem; font-family:Inter, sans-serif; padding:2px;">
                            <strong>${p.lot_number || p.parcel_id || 'Parcel'} (${p.survey_number || ''})</strong><br>
                            <span style="color:#64748b;">${p.owner_name || 'Landowner'}</span><br>
                            <code style="font-weight:700; color:#1e40af;">${p.ulpin || ''}</code>
                        </div>
                    `, { sticky: true, opacity: 0.95 });

                    // Click to select & open drawer
                    layer.on('click', function(e) {
                        L.DomEvent.stopPropagation(e);
                        self.selectParcel(feature, layer, false);
                    });
                }
            }).addTo(this.map);

            console.log(`[MapEngine] Loaded ${geojsonData.features.length} cadastral parcels successfully.`);
        },

        getParcelStyle: function(props) {
            let fillColor = '#2563eb'; // Occupied default
            let borderColor = '#60a5fa';

            if (props.status === 'available') {
                fillColor = '#059669'; // Emerald clear title
                borderColor = '#34d399';
            } else if (props.status === 'disputed') {
                fillColor = '#dc2626'; // Crimson disputed
                borderColor = '#f87171';
            }

            return {
                fillColor: fillColor,
                weight: 1.8,
                opacity: 0.95,
                color: borderColor,
                dashArray: props.status === 'disputed' ? '4, 4' : '',
                fillOpacity: 0.52
            };
        },

        selectParcel: function(feature, layer, fitBounds) {
            if (window.LandStackState) {
                window.LandStackState.setActiveParcel(feature);
            }

            // Reset previous highlight
            if (this.activeHighlightLayer && this.cadastreLayer) {
                this.cadastreLayer.resetStyle(this.activeHighlightLayer);
            }

            this.activeHighlightLayer = layer;
            layer.setStyle({
                weight: 3.5,
                color: '#f59e0b', // Amber highlight stroke
                fillColor: '#f59e0b',
                fillOpacity: 0.65
            });
            layer.bringToFront();

            // Zoom gently if requested or not in view
            if (fitBounds || this.map.getZoom() < 16) {
                this.map.fitBounds(layer.getBounds(), { maxZoom: 19, padding: [60, 60] });
            }

            // Open rich popup card
            const popupHTML = this.createParcelPopupHTML(feature.properties);
            layer.bindPopup(popupHTML, {
                maxWidth: 380,
                className: 'prime-leaflet-popup'
            }).openPopup();

            // Open dedicated sliding parcel information drawer
            if (typeof window.openParcelDrawer === 'function') {
                window.openParcelDrawer(feature.properties);
            }
        },

        selectParcelById: function(id, fitBounds = true) {
            let targetFeature = null;
            let targetLayer = null;

            if (this.cadastreLayer) {
                this.cadastreLayer.eachLayer(layer => {
                    if (layer.feature && (layer.feature.properties.id === id || String(layer.feature.properties.id) === String(id))) {
                        targetFeature = layer.feature;
                        targetLayer = layer;
                    }
                });
            }

            if (targetFeature && targetLayer) {
                this.selectParcel(targetFeature, targetLayer, fitBounds);
            } else {
                console.warn(`[MapEngine] Parcel #${id} not found on map layer.`);
            }
        },

        selectParcelByUlpin: function(ulpin, fitBounds = true) {
            const clean = (ulpin || '').toUpperCase().trim();
            let targetFeature = null;
            let targetLayer = null;

            if (this.cadastreLayer) {
                this.cadastreLayer.eachLayer(layer => {
                    if (layer.feature && layer.feature.properties && layer.feature.properties.ulpin) {
                        if (layer.feature.properties.ulpin.toUpperCase().trim() === clean) {
                            targetFeature = layer.feature;
                            targetLayer = layer;
                        }
                    }
                });
            }

            if (targetFeature && targetLayer) {
                this.selectParcel(targetFeature, targetLayer, fitBounds);
            }
        },

        // Citizen "My Lands (2)" Property Cycler
        viewMyCitizenProperties: function() {
            const ulpins = (window.ApiService && window.ApiService.auth) 
                ? window.ApiService.auth.getCitizenPortfolio() 
                : ['79Q5CNX8ICNOELA', '79Q5RUS004501'];

            if (!ulpins || ulpins.length === 0) {
                if (window.LandStackState) window.LandStackState.showToast('No properties linked to this Aadhaar.', 'fas fa-info-circle');
                return;
            }

            this.currentMyPropIndex = (this.currentMyPropIndex + 1) % ulpins.length;
            const targetUlpin = ulpins[this.currentMyPropIndex];

            this.selectParcelByUlpin(targetUlpin, true);

            const propTitle = this.currentMyPropIndex === 0 ? 'Plot 17-A (Madhurawada)' : 'Plot 45 (Rushikonda)';
            if (window.LandStackState) {
                window.LandStackState.showToast(`Showing Property ${this.currentMyPropIndex + 1} of ${ulpins.length}: ${propTitle}`, 'fas fa-map-marked-alt');
            }
        },

        checkAutoLocate: function() {
            const self = this;
            const urlParams = new URLSearchParams(window.location.search);
            const role = (urlParams.get('role') || sessionStorage.getItem('landstack_role') || 'citizen').toLowerCase();
            const locate = urlParams.get('locate') === 'true' || sessionStorage.getItem('landstack_locate_on_login') === 'true';

            if (role === 'citizen' && locate) {
                sessionStorage.removeItem('landstack_locate_on_login');
                setTimeout(function() {
                    self.viewMyCitizenProperties();
                }, 700);
            }
        },

        createParcelPopupHTML: function(p) {
            const statusClass = p.status === 'available' ? 'badge-available' : (p.status === 'disputed' ? 'badge-disputed' : 'badge-occupied');
            const marketValStr = (window.LandStackState && window.LandStackState.formatINR) ? window.LandStackState.formatINR(p.market_value) : `₹ ${Number(p.market_value || 7500000).toLocaleString()}`;
            const taxStr = (window.LandStackState && window.LandStackState.formatINR) ? window.LandStackState.formatINR(p.tax_dues_amount) : `₹ ${Number(p.tax_dues_amount || 0).toLocaleString()}`;

            return `
                <div class="parcel-popup-card" style="font-family: Inter, sans-serif; color: #0f172a; padding: 4px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:6px; margin-bottom:8px;">
                        <span class="result-badge ${statusClass}" style="font-size:0.68rem; padding:2px 6px; font-weight:700;">${(p.status || 'AVAILABLE').toUpperCase()}</span>
                        <code style="font-family: monospace; font-size:0.75rem; background:#f1f5f9; padding:2px 6px; border-radius:4px; font-weight:700; color:#1e3a8a;">${p.ulpin || '79Q5CNX8ICNOEL'}</code>
                    </div>

                    <h4 style="margin:0 0 4px 0; font-size:0.92rem; font-weight:800; color:#0f172a;">${p.lot_number || p.parcel_id || 'Parcel'} (${p.survey_number || 'Sy. No. 148/24'})</h4>
                    <p style="margin:0 0 8px 0; font-size:0.75rem; color:#475569;"><i class="fas fa-map-marker-alt"></i> ${p.address || 'Visakhapatnam Urban Mandal, Andhra Pradesh'}</p>

                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px; font-size:0.74rem; display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-bottom:10px;">
                        <div><span style="color:#64748b;">Legal Owner:</span><br><strong>${p.owner_name || 'Sri K. Rama Rao'}</strong></div>
                        <div><span style="color:#64748b;">Cadastral Extent:</span><br><strong>${Number(p.area_sqft || 2400).toLocaleString()} Sq.Ft</strong></div>
                        <div><span style="color:#64748b;">Market Value:</span><br><strong style="color:#059669;">${marketValStr}</strong></div>
                        <div><span style="color:#64748b;">GVMC Tax Dues:</span><br><strong style="${p.tax_dues_amount > 0 ? 'color:#dc2626;' : 'color:#059669;'}">${taxStr}</strong></div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <button onclick="if(window.BhuAI) window.BhuAI.analyzeParcel(${p.id});" style="background:linear-gradient(135deg, #7c3aed, #4f46e5); color:#fff; border:none; padding:7px 10px; border-radius:6px; font-size:0.76rem; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                            <i class="fas fa-brain" style="color:#fcd34d;"></i> <span>Inspect with Bhu-AI Risk Radar</span>
                        </button>
                        <div style="display:flex; gap:6px;">
                            <button onclick="window.openRoRPassbook(${p.id})" style="flex:1; background:#0f2b5c; color:#fff; border:none; padding:6px; border-radius:6px; font-size:0.72rem; font-weight:700; cursor:pointer;">
                                <i class="fas fa-file-contract"></i> RoR (1-B)
                            </button>
                            <button onclick="window.openTaxDemandNotice(${p.id})" style="flex:1; background:#059669; color:#fff; border:none; padding:6px; border-radius:6px; font-size:0.72rem; font-weight:700; cursor:pointer;">
                                <i class="fas fa-receipt"></i> GVMC Tax
                            </button>
                            <button onclick="window.openParcelDrawer(window.MapEngine.parcelFeatureMap[${p.id}].properties)" style="flex:1; background:#f59e0b; color:#fff; border:none; padding:6px; border-radius:6px; font-size:0.72rem; font-weight:700; cursor:pointer;">
                                <i class="fas fa-sliders-h"></i> Panel
                            </button>
                        </div>
                    </div>
                </div>
            `;
        },

        loadInfrastructureLayers: function() {
            // Water Supply Pipeline Vectors
            if (window.waterSupplyData) {
                this.waterLayer = L.geoJSON(window.waterSupplyData, {
                    style: { color: '#06b6d4', weight: 2.5, opacity: 0.75, dashArray: '5, 5' }
                });
            }

            // Power Grid High Voltage Corridor Vectors
            if (window.powerGridData) {
                this.powerLayer = L.geoJSON(window.powerGridData, {
                    style: { color: '#eab308', weight: 2, opacity: 0.8 }
                });
            }

            // Coastal Regulation Zone (CRZ-I / CRZ-II Boundaries)
            if (window.coastalRegulationZoneData) {
                this.crzLayer = L.geoJSON(window.coastalRegulationZoneData, {
                    style: { color: '#f97316', weight: 3, opacity: 0.85, dashArray: '8, 6' }
                });
            }
        },

        toggleLayer: function(layerName, enabled) {
            if (layerName === 'satellite') {
                if (enabled) {
                    if (this.baseLayers.dark) this.map.removeLayer(this.baseLayers.dark);
                    this.baseLayers.satellite.addTo(this.map);
                    this.activeBaseLayer = this.baseLayers.satellite;
                } else {
                    this.map.removeLayer(this.baseLayers.satellite);
                    this.baseLayers.dark.addTo(this.map);
                    this.activeBaseLayer = this.baseLayers.dark;
                }
            } else if (layerName === 'cadastre' && this.cadastreLayer) {
                enabled ? this.cadastreLayer.addTo(this.map) : this.map.removeLayer(this.cadastreLayer);
            } else if (layerName === 'water' && this.waterLayer) {
                enabled ? this.waterLayer.addTo(this.map) : this.map.removeLayer(this.waterLayer);
            } else if (layerName === 'power' && this.powerLayer) {
                enabled ? this.powerLayer.addTo(this.map) : this.map.removeLayer(this.powerLayer);
            } else if (layerName === 'crz' && this.crzLayer) {
                enabled ? this.crzLayer.addTo(this.map) : this.map.removeLayer(this.crzLayer);
            }
        },

        bindTelemetryEvents: function() {
            const hudCoords = document.getElementById('hud-coords');
            const hudZoom = document.getElementById('hud-zoom');

            this.map.on('mousemove', function(e) {
                if (hudCoords) {
                    hudCoords.innerHTML = `LAT: <span>${e.latlng.lat.toFixed(5)}° N</span> &nbsp; LNG: <span>${e.latlng.lng.toFixed(5)}° E</span>`;
                }
            });

            this.map.on('zoomend', () => {
                if (hudZoom) {
                    hudZoom.innerHTML = `ZOOM: <span>${this.map.getZoom()}</span>`;
                }
            });
        },

        bindSearchAndFilters: function() {
            const input = document.getElementById('prime-search-input');
            const dropdown = document.getElementById('prime-search-dropdown');
            const self = this;

            if (!input || !dropdown) return;

            // Handle Input Typing
            input.addEventListener('input', function() {
                const query = input.value.trim().toLowerCase();
                if (!query || query.length < 2) {
                    dropdown.style.display = 'none';
                    return;
                }

                const matches = self.allParcels.filter(f => {
                    const p = f.properties;
                    return (p.ulpin && p.ulpin.toLowerCase().includes(query)) ||
                           (p.survey_number && p.survey_number.toLowerCase().includes(query)) ||
                           (p.lot_number && p.lot_number.toLowerCase().includes(query)) ||
                           (p.parcel_id && String(p.parcel_id).toLowerCase().includes(query)) ||
                           (p.owner_name && p.owner_name.toLowerCase().includes(query)) ||
                           (p.address && p.address.toLowerCase().includes(query)) ||
                           (p.zone && p.zone.toLowerCase().includes(query));
                }).slice(0, 8);

                if (matches.length === 0) {
                    dropdown.innerHTML = `<div style="padding:12px; text-align:center; color:#94a3b8; font-size:0.78rem;">No cadastral parcels found matching "<strong>${input.value}</strong>"</div>`;
                } else {
                    dropdown.innerHTML = matches.map(f => {
                        const p = f.properties;
                        const statusClass = p.status === 'available' ? 'badge-available' : (p.status === 'disputed' ? 'badge-disputed' : 'badge-occupied');
                        return `
                            <div class="search-result-item" onclick="window.MapEngine.selectParcelById(${p.id}); document.getElementById('prime-search-dropdown').style.display='none';">
                                <div class="result-main">
                                    <h4>${p.lot_number || p.parcel_id || 'Parcel'} (${p.survey_number})</h4>
                                    <p>${p.owner_name} &bull; <code>${p.ulpin}</code></p>
                                </div>
                                <span class="result-badge ${statusClass}">${(p.status || 'AVAILABLE').toUpperCase()}</span>
                            </div>
                        `;
                    }).join('');
                }
                dropdown.style.display = 'block';
            });

            // Handle Enter Key to select first match
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const query = input.value.trim().toLowerCase();
                    if (!query) return;

                    const match = self.allParcels.find(f => {
                        const p = f.properties;
                        return (p.ulpin && p.ulpin.toLowerCase().includes(query)) ||
                               (p.survey_number && p.survey_number.toLowerCase().includes(query)) ||
                               (p.lot_number && p.lot_number.toLowerCase().includes(query)) ||
                               (p.owner_name && p.owner_name.toLowerCase().includes(query)) ||
                               (p.address && p.address.toLowerCase().includes(query));
                    });

                    if (match) {
                        dropdown.style.display = 'none';
                        self.selectParcelById(match.properties.id, true);
                    }
                }
            });

            // Hide dropdown when clicking outside
            document.addEventListener('click', function(e) {
                if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                    dropdown.style.display = 'none';
                }
            });
        },

        filterByZone: function(zoneKey) {
            if (!this.cadastreLayer) return;
            this.cadastreLayer.eachLayer(layer => {
                const match = !zoneKey || (layer.feature && layer.feature.properties && layer.feature.properties.zone === zoneKey);
                layer.setStyle({ opacity: match ? 0.95 : 0.12, fillOpacity: match ? 0.52 : 0.04 });
            });
        }
    };

    window.MapEngine = MapEngine;
    window.viewMyCitizenProperties = function() {
        MapEngine.viewMyCitizenProperties();
    };

})(window);
