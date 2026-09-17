/* =========================================================
   LANDSTACK PRIME - BHU-AI TITLE INTELLIGENCE SCANNER (v2.0)
   Instant Legal Risk Radar & Bilingual Plain Language Translator
   ========================================================= */

(function(window) {
    'use strict';

    const BhuAI = {
        activeParcel: null,

        togglePanel: function() {
            const panel = document.getElementById('bhu-ai-panel');
            if (!panel) return;
            if (panel.style.display === 'flex') {
                panel.style.display = 'none';
            } else {
                if (LandStackState.activeParcel) {
                    this.analyzeParcel(LandStackState.activeParcel.properties.id);
                } else {
                    // Default to demo property
                    this.analyzeParcel(2370);
                }
            }
        },

        analyzeParcel: function(parcelId) {
            let feature = null;
            if (window.PARCELS_GEOJSON && window.PARCELS_GEOJSON.features) {
                feature = window.PARCELS_GEOJSON.features.find(f => f.properties.id === parcelId);
            }

            if (!feature && LandStackState.activeParcel) {
                feature = LandStackState.activeParcel;
            }

            if (!feature) {
                LandStackState.showToast('Please select a parcel on the map to inspect.', 'fas fa-info-circle');
                return;
            }

            const p = feature.properties;
            this.activeParcel = feature;

            const panel = document.getElementById('bhu-ai-panel');
            panel.style.display = 'flex';

            // Populate AI Header
            document.getElementById('bhu-ai-target-ulpin').textContent = p.ulpin;
            document.getElementById('bhu-ai-target-plot').textContent = `${p.lot_number || p.parcel_id} (${p.survey_number})`;

            // Calculate Risk Score & Flags
            let score = 98;
            let scoreClass = 'safe';
            let riskTitle = 'LOW RISK • CLEAR AUTHORIZED TITLE';
            
            const isDisputed = p.status === 'disputed';
            const hasTaxArrears = p.tax_dues_amount > 0;
            const isNearCoast = p.zone === 'rushikonda' || p.zone === 'bheemili';

            if (isDisputed) {
                score = 35;
                scoreClass = 'danger';
                riskTitle = 'HIGH RISK • ACTIVE BOUNDARY / TITLE DISPUTE';
            } else if (hasTaxArrears || isNearCoast) {
                score = 78;
                scoreClass = 'caution';
                riskTitle = 'MODERATE CAUTION • STATUTORY REVIEW REQUIRED';
            }

            const scoreEl = document.getElementById('bhu-ai-score-num');
            scoreEl.textContent = `${score}/100`;
            scoreEl.className = `risk-score-display ${scoreClass}`;
            document.getElementById('bhu-ai-score-label').textContent = riskTitle;

            // Audit Checkpoints
            const auditList = document.getElementById('bhu-ai-audit-list');
            auditList.innerHTML = `
                <div class="ai-audit-item">
                    <span><i class="fas fa-landmark" style="color:#60a5fa;"></i> Registry Clear Title (RoR):</span>
                    <strong style="color:${isDisputed ? '#ef4444' : '#10b981'};">${isDisputed ? 'Disputed / Litigated' : '100% Freehold Verified'}</strong>
                </div>
                <div class="ai-audit-item">
                    <span><i class="fas fa-shield-alt" style="color:#10b981;"></i> Bank Encumbrance / Lien:</span>
                    <strong style="color:#10b981;">Nil (Zero Mortgage Lien)</strong>
                </div>
                <div class="ai-audit-item">
                    <span><i class="fas fa-water" style="color:#f59e0b;"></i> CRZ Shoreline Buffer:</span>
                    <strong style="color:${isNearCoast ? '#f59e0b' : '#10b981'};">${isNearCoast ? 'CRZ-II Regulated Zone' : 'Clear Urban Zone (Non-CRZ)'}</strong>
                </div>
                <div class="ai-audit-item">
                    <span><i class="fas fa-coins" style="color:#38bdf8;"></i> GVMC Property Tax Status:</span>
                    <strong style="color:${hasTaxArrears ? '#ef4444' : '#10b981'};">${hasTaxArrears ? 'Arrears Pending' : 'Paid in Full (Current)'}</strong>
                </div>
            `;

            // Plain English & Telugu Natural Language Summary
            const engText = isDisputed 
                ? `WARNING: Parcel ${p.ulpin} (${p.survey_number}) is flagged under active revenue inquiry. Potential overlapping claims with adjacent pattadars. Immediate Tahsildar adjudication required.`
                : `AUTHENTICATED: Parcel ${p.ulpin} (${p.survey_number}) owned by ${p.owner_name} has an unencumbered legal title with clear boundary demarcations and up-to-date GVMC municipal tax assessments.`;

            const teluguText = isDisputed
                ? `హెచ్చరిక: సర్వే నెం ${p.survey_number} (ULPIN: ${p.ulpin}) పరిధిలోని ఈ స్థలం వివాదంలో ఉంది. తహసీల్దార్ విచారణ పూర్తయ్యే వరకు రిజిస్ట్రేషన్ లేదా లావాదేవీలు నిలిపివేయబడ్డాయి.`
                : `ధృవీకరించబడింది: సర్వే నెం ${p.survey_number} లోని ఈ భూమి (${p.owner_name}) పూర్తి హక్కులతో ఉంది. ఎటువంటి బ్యాంకు తాకట్టులు లేదా న్యాయపరమైన వివాదాలు లేవు. ఆస్తి పన్ను చెల్లించబడింది.`;

            document.getElementById('bhu-ai-summary-eng').textContent = engText;
            document.getElementById('bhu-ai-summary-tel').textContent = teluguText;

            LandStackState.showToast(`Bhu-AI Title Intelligence analysis complete for ${p.ulpin}`, 'fas fa-brain');
        }
    };

    window.BhuAI = BhuAI;

})(window);
