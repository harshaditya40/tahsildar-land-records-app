/* =========================================================
   LANDSTACK PRIME - SRO SUB-REGISTRAR PORTAL (v2.0)
   Deed Registration, Statutory Fees & Instant Auto-Mutation
   ========================================================= */

(function(window) {
    'use strict';

    const SROModule = {
        activeParcel: null,

        openDeedModal: function(parcelFeature) {
            this.activeParcel = parcelFeature || LandStackState.activeParcel;

            const modal = document.getElementById('modal-sro-deed');
            if (!modal) return;

            if (this.activeParcel) {
                const p = this.activeParcel.properties;
                document.getElementById('sro-snap-ulpin').textContent = p.ulpin;
                document.getElementById('sro-snap-survey').textContent = `${p.survey_number} (${p.lot_number || p.parcel_id})`;
                document.getElementById('sro-snap-owner').textContent = p.owner_name;
                document.getElementById('sro-snap-area').textContent = `${Number(p.area_sqft).toLocaleString()} Sq.Ft`;
                document.getElementById('sro-sale-seller-name').value = p.owner_name;
                document.getElementById('sro-sale-value').value = p.market_value || 5000000;
            } else {
                document.getElementById('sro-snap-ulpin').textContent = '79Q5CNX8ICNOEL';
                document.getElementById('sro-snap-survey').textContent = 'Sy. No. 148/24 (Plot 17-A)';
                document.getElementById('sro-snap-owner').textContent = 'Sri K. Rama Rao';
                document.getElementById('sro-snap-area').textContent = '2,400 Sq.Ft';
                document.getElementById('sro-sale-seller-name').value = 'Sri K. Rama Rao';
                document.getElementById('sro-sale-value').value = 7500000;
            }

            this.recalculateFees();
            modal.style.display = 'flex';
        },

        recalculateFees: function() {
            const valInput = document.getElementById('sro-sale-value');
            const consideration = parseFloat(valInput ? valInput.value : 0) || 0;

            // AP Statutory Rates: 5% Stamp Duty + 1% Registration Fee
            const stampDuty = Math.round(consideration * 0.05);
            const regFee = Math.round(consideration * 0.01);
            const total = stampDuty + regFee;

            document.getElementById('sro-fee-stamp').textContent = LandStackState.formatINR(stampDuty);
            document.getElementById('sro-fee-reg').textContent = LandStackState.formatINR(regFee);
            document.getElementById('sro-fee-total').textContent = LandStackState.formatINR(total);
        },

        submitRegistration: function() {
            const deedType = document.getElementById('sro-deed-type').value;
            const buyerName = document.getElementById('sro-sale-buyer-name').value.trim() || 'Sri M. Venkata Ramana';
            const val = document.getElementById('sro-sale-value').value;

            const docNo = `AP/SRO/VSKP/2026/00${Math.floor(100 + Math.random() * 900)}`;
            const mutRef = `MUT-2026-00${Math.floor(600 + Math.random() * 399)}`;
            const ulpin = this.activeParcel ? this.activeParcel.properties.ulpin : '79Q5CNX8ICNOEL';

            // Auto-queue into Stage 2 (Mandal Surveyor) or Stage 3 (Tahsildar)
            LandStackState.mutationTasks.unshift({
                application_no: mutRef,
                ulpin: ulpin,
                survey_number: this.activeParcel ? this.activeParcel.properties.survey_number : 'Sy. No. 148/24',
                applicant_name: buyerName,
                phone: '+91 98480 33445',
                mutation_type: `SRO ${deedType.replace('_', ' ').toUpperCase()} Registration`,
                deed_ref: docNo,
                current_stage: 2, // Auto-forwarded to Mandal Surveyor
                notice_days_remaining: 15,
                status: 'Stage 2: Field Surveyor Inspection & DGPS Verification',
                surveyor_assigned: 'Mandal Cadastral Surveyor (Madhurawada)',
                surveyor_remarks: `SRO Auto-Mutation Triggered. Registered under Doc No: ${docNo}. Awaiting field verification.`,
                created_at: 'Just now'
            });

            document.getElementById('modal-sro-deed').style.display = 'none';

            // Open Success Modal
            document.getElementById('receipt-deed-no').textContent = docNo;
            document.getElementById('receipt-mut-ref').textContent = mutRef;
            document.getElementById('receipt-buyer-name').textContent = buyerName;
            document.getElementById('receipt-declared-val').textContent = LandStackState.formatINR(val);

            document.getElementById('modal-sro-success').style.display = 'flex';
            LandStackState.showToast(`Deed ${docNo} Registered! Auto-mutation ${mutRef} initiated without manual friction.`, 'fas fa-check-double');
            LandStackState.emit('taskUpdated');
        }
    };

    window.SROModule = SROModule;

})(window);
