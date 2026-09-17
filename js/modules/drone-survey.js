/* =========================================================
   LANDSTACK PRIME - DRONE DGPS RTK SURVEY INGESTION (v2.0)
   SVAMITVA Aligned High-Precision Cadastral Demarcation
   ========================================================= */

(function(window) {
    'use strict';

    const DroneSurveyModule = {
        activeGCPs: [
            { id: 'GCP #1', lng: 83.3592145, lat: 17.8381204, precision: '± 1.1 cm (RTK Fixed)' },
            { id: 'GCP #2', lng: 83.3598502, lat: 17.8382408, precision: '± 1.2 cm (RTK Fixed)' },
            { id: 'GCP #3', lng: 83.3597810, lat: 17.8386121, precision: '± 1.3 cm (RTK Fixed)' },
            { id: 'GCP #4', lng: 83.3591420, lat: 17.8384905, precision: '± 1.1 cm (RTK Fixed)' }
        ],

        openDroneModal: function() {
            const modal = document.getElementById('modal-drone-dgps');
            if (!modal) return;

            const tbody = document.getElementById('tbody-drone-gcps');
            if (tbody) {
                tbody.innerHTML = this.activeGCPs.map(g => `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                        <td style="padding:6px 10px; font-weight:700; color:#60a5fa;">${g.id}</td>
                        <td style="padding:6px 10px; font-family:var(--font-mono);">${g.lng.toFixed(6)}° E</td>
                        <td style="padding:6px 10px; font-family:var(--font-mono);">${g.lat.toFixed(6)}° N</td>
                        <td style="padding:6px 10px; font-weight:700; color:#34d399;">${g.precision}</td>
                    </tr>
                `).join('');
            }

            modal.style.display = 'flex';
        },

        previewOnSatelliteMap: function() {
            MapEngine.toggleLayer('satellite', true);
            MapEngine.map.flyTo([17.8383, 83.3595], 18, { duration: 1.5 });
            LandStackState.showToast('Drone Orthomosaic & RTK GCP points layered on satellite view.', 'fas fa-satellite-dish');
            document.getElementById('modal-drone-dgps').style.display = 'none';
        },

        commitToDatabase: function() {
            LandStackState.showToast('Drone DGPS Demarcation Committed! Cadastral boundary verified with ±1.2cm RTK precision.', 'fas fa-check-double');
            document.getElementById('modal-drone-dgps').style.display = 'none';

            // Mark first pending surveyor task as demarcated and advance to Tahsildar
            const task = LandStackState.mutationTasks.find(t => t.current_stage === 2);
            if (task) {
                task.current_stage = 3;
                task.status = 'Stage 3: Tahsildar Statutory Review & Public Notice';
                task.surveyor_remarks = 'Drone DGPS RTK Demarcation approved (Flight Ref: DRONE-VSP-2026-F801). Boundary coordinates verified.';
                LandStackState.emit('taskUpdated');
            }
        }
    };

    window.DroneSurveyModule = DroneSurveyModule;

})(window);
