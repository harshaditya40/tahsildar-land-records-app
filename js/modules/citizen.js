/* =========================================================
   TAHSILDAR — CITIZEN BHU-AADHAAR VAULT (v2.0)
   Property Portfolio, Form 6-A Filing & 4-Stage Lifecycle Stepper
   ========================================================= */

(function(window) {
    'use strict';

    const CitizenModule = {
        init: function() {
            LandStackState.on('roleChange', (role) => {
                if (role === 'citizen') {
                    this.renderPortfolio();
                }
            });
            this.renderPortfolio();
        },

        renderPortfolio: function() {
            const container = document.getElementById('citizen-property-cards-list');
            if (!container) return;

            const properties = [
                {
                    ulpin: '79Q5CNX8ICNOEL',
                    title: 'Plot 17-A, Madhurawada IT City',
                    survey: 'Sy. No. 148/24',
                    extent: '2,400 Sq.Ft (266.7 Sq.Yds)',
                    valuation: '₹ 84,00,000',
                    taxStatus: 'Paid (Active)',
                    id: 2370,
                    lat: 17.8383,
                    lng: 83.3595
                },
                {
                    ulpin: '79Q5RUS004501',
                    title: 'Plot 45, Rushikonda IT Corridor',
                    survey: 'Sy. No. 89/1B',
                    extent: '3,600 Sq.Ft (400 Sq.Yds)',
                    valuation: '₹ 1,45,00,000',
                    taxStatus: 'Paid (Active)',
                    id: 2422,
                    lat: 17.7885,
                    lng: 83.3850
                }
            ];

            container.innerHTML = properties.map(p => `
                <div class="property-mini-card" onclick="window.CitizenModule.locateProperty(${p.lat}, ${p.lng}, '${p.ulpin}', ${p.id})">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <h4>${p.title}</h4>
                        <span class="result-badge badge-available" style="font-size:0.65rem;">VERIFIED</span>
                    </div>
                    <code class="ulpin-code"><i class="fas fa-fingerprint"></i> ${p.ulpin}</code>
                    <p style="margin:4px 0;"><i class="fas fa-map-pin"></i> ${p.survey} &bull; ${p.extent}</p>
                    <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-top:8px; border-top:1px solid rgba(255,255,255,0.06); padding-top:6px;">
                        <span style="color:#64748b;">Valuation: <strong style="color:#34d399;">${p.valuation}</strong></span>
                        <span style="color:#60a5fa; font-weight:700;"><i class="fas fa-crosshairs"></i> Locate on Map</span>
                    </div>
                </div>
            `).join('');
        },

        locateProperty: function(lat, lng, ulpin, parcelId) {
            MapEngine.map.flyTo([lat, lng], 17, { duration: 1.2 });
            MapEngine.selectParcelById(parcelId);
            LandStackState.showToast(`Centered on property: ${ulpin}`, 'fas fa-map-marker-alt');
            
            // Close modal if open
            const modal = document.getElementById('modal-citizen-vault');
            if (modal) modal.style.display = 'none';
        },

        submitMutationApplication: async function() {
            const type = document.getElementById('mut-service-type').value;
            const name = document.getElementById('mut-applicant-name').value.trim() || LandStackState.citizen.name;
            const deed = document.getElementById('mut-deed-ref').value.trim() || `AP/SRO/VSKP/2026/00${Math.floor(100 + Math.random() * 900)}`;
            const targetUlpin = (document.getElementById('mut-target-ulpin') && document.getElementById('mut-target-ulpin').value) || '79Q5CNX8ICNOEL';
            const targetSurvey = (document.getElementById('mut-target-survey') && document.getElementById('mut-target-survey').value) || 'Sy. No. 148/24';

            let newAppNo = `MUT-2026-00${Math.floor(500 + Math.random() * 499)}`;

            // Call real backend API
            try {
                const res = await fetch('/api/citizen/apply-mutation/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ulpin: targetUlpin,
                        survey_number: targetSurvey,
                        applicant_name: name,
                        applicant_phone: LandStackState.citizen.phone,
                        mutation_type: type,
                        deed_ref: deed
                    })
                });
                const data = await res.json();
                if (data.success && data.application_no) {
                    newAppNo = data.application_no;
                }
            } catch (err) {
                console.warn('Backend API offline, falling back to local store', err);
            }
            
            const newTask = {
                application_no: newAppNo,
                ulpin: targetUlpin,
                survey_number: targetSurvey,
                applicant_name: name,
                phone: LandStackState.citizen.phone,
                mutation_type: type,
                deed_ref: deed,
                current_stage: 1, // Application Received
                notice_days_remaining: 15,
                status: 'Stage 1: Application Received & Scrutiny (CSC Gateway)',
                surveyor_assigned: 'Mandal Cadastral Surveyor (Madhurawada)',
                surveyor_remarks: 'Application logged. Routing to Mandal Surveyor for field demarcation.',
                created_at: 'Just now'
            };

            LandStackState.mutationTasks.unshift(newTask);
            LandStackState.showToast(`Application ${newAppNo} submitted successfully! Token generated.`, 'fas fa-paper-plane');
            document.getElementById('modal-apply-mutation').style.display = 'none';

            // Open Tracking Drawer with this application
            this.openTrackingDrawer(newAppNo);
        },

        openTrackingDrawer: function(appNo) {
            const drawer = document.getElementById('drawer-tracking');
            if (!drawer) return;

            const targetNo = appNo || 'MUT-2026-00481';
            const task = LandStackState.mutationTasks.find(t => t.application_no === targetNo) || LandStackState.mutationTasks[0];

            document.getElementById('track-active-app-no').textContent = task.application_no;
            document.getElementById('track-active-ulpin').textContent = task.ulpin;
            document.getElementById('track-active-applicant').textContent = task.applicant_name;
            document.getElementById('track-active-type').textContent = task.mutation_type;

            // Render 4-stage stepper
            const stages = [
                { num: 1, title: 'Application Received & Statutory Scrutiny', authority: 'TAHSILDAR Citizen Gateway / CSC Adaptor', desc: 'Application registered, deed reference authenticated, statutory token generated.' },
                { num: 2, title: 'Field Surveyor Inspection & DGPS Verification', authority: task.surveyor_assigned, desc: 'On-ground RTK GNSS boundary check, physical possession verification, and GCP check.' },
                { num: 3, title: 'Tahsildar Statutory Review & 15-Day Notice', authority: 'Office of the Tahasildar & Executive Magistrate', desc: '15-day statutory public notice compliance, objection verification, and digital signoff.' },
                { num: 4, title: 'Webland 2.0 RoR Mutated & Cadastre Synced', authority: 'Central Land Registry Engine (DoLR)', desc: 'Official Form 1-B e-Passbook issued, GeoJSON cadastral layer updated, SMS dispatched.' }
            ];

            const stepperContainer = document.getElementById('tracking-stepper-container');
            stepperContainer.innerHTML = stages.map(s => {
                let statusClass = '';
                let markerIcon = s.num;

                if (s.num < task.current_stage) {
                    statusClass = 'completed';
                    markerIcon = '<i class="fas fa-check"></i>';
                } else if (s.num === task.current_stage) {
                    statusClass = 'active';
                    markerIcon = '<i class="fas fa-spinner fa-spin"></i>';
                }

                return `
                    <div class="step-node ${statusClass}">
                        <div class="step-marker">${markerIcon}</div>
                        <div class="step-content">
                            <h4>${s.title}</h4>
                            <p>${s.desc}</p>
                            <span class="step-authority-tag"><i class="fas fa-landmark"></i> ${s.authority}</span>
                        </div>
                    </div>
                `;
            }).join('');

            drawer.style.display = 'flex';
        }
    };

    window.CitizenModule = CitizenModule;

})(window);
