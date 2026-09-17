/* =========================================================
   APSAC GATI SHAKTI - COASTAL REGULATION ZONE (CRZ) WMS
   Official Andhra Pradesh Government GeoServer Integration
   Endpoint: https://apsac.ap.gov.in/geoserver/gatishakti/wms
   ========================================================= */

window.initCRZLayer = function(map) {
    // Official APSAC Gati Shakti Coastal Regulation Zone Layers
    var layersList = [
        "gatishakti:crz_boundary",
        "gatishakti:crz_ia",
        "gatishakti:crz_ib",
        "gatishakti:crz_ii",
        "gatishakti:no_development_zone_crz_iii",
        "gatishakti:t200_m_crz_line_ndz",
        "gatishakti:t200_m_to_500_m_from_htl_crz_iii",
        "gatishakti:t50m_mangrove_buffer_zone_crz_ia"
    ].join(',');

    var crzWmsLayer = L.tileLayer.wms("https://apsac.ap.gov.in/geoserver/gatishakti/wms", {
        layers: layersList,
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        opacity: 0.85,
        maxZoom: 22,
        attribution: '&copy; <a href="https://apsac.ap.gov.in" target="_blank">APSAC</a> Gati Shakti CRZ / MoEFCC'
    });

    return crzWmsLayer;
};

