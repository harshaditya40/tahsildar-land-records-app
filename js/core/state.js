/* =========================================================
   LANDSTACK PRIME - CENTRAL STATE ENGINE & STORE (v2.0)
   Manages Application State, Stakeholder Roles, & Tasks
   ========================================================= */

(function(window) {
    'use strict';

    const LandStackState = {
        currentRole: 'citizen', // 'citizen' | 'surveyor' | 'tahsildar' | 'sro' | 'collector'
        activeParcel: null,
        activeParcelId: null,
        activeTool: null, // 'draw' | 'subdivide' | 'measure' | 'drone'
        searchQuery: '',
        selectedZone: '',
        selectedStatus: '',

        // Authenticated Citizen Persona (Sri K. Rama Rao - Hackathon Demo)
        citizen: {
            name: 'Sri K. Rama Rao',
            aadhaar: '5489 2104 8921',
            phone: '+91 98480 22338',
            properties: ['79Q5CNX8ICNOEL', '79Q5RUS004501']
        },

        // Mock Live Tasks Queue for Surveyors & Tahsildars
        mutationTasks: [
            {
                application_no: 'MUT-2026-00481',
                ulpin: '79Q5CNX8ICNOEL',
                survey_number: 'Sy. No. 148/24',
                applicant_name: 'Sri K. Rama Rao',
                phone: '+91 98480 22338',
                mutation_type: 'Sale Deed Mutation (Post SRO)',
                deed_ref: 'AP/SRO/VSKP/2026/000481',
                current_stage: 3, // Tahsildar Review
                notice_days_remaining: 2,
                status: 'Stage 3: Tahsildar Statutory Review & Public Notice',
                surveyor_assigned: 'Mandal Cadastral Surveyor (Madhurawada)',
                surveyor_remarks: 'DGPS boundary demarcation completed. Sub-centimeter RTK fix confirmed with zero neighbor overlap.',
                created_at: '01-Sep-2026'
            },
            {
                application_no: 'MUT-2026-00512',
                ulpin: '79Q5RUS004501',
                survey_number: 'Sy. No. 89/1B',
                applicant_name: 'Smt. P. Annapurna',
                phone: '+91 94401 88321',
                mutation_type: 'Succession / Legal Heir Inheritance',
                deed_ref: 'FORM6-AP-2026-8912',
                current_stage: 2, // Field Surveyor Demarcation
                notice_days_remaining: 11,
                status: 'Stage 2: Field Surveyor Inspection & DGPS Verification',
                surveyor_assigned: 'Mandal Cadastral Surveyor (Rushikonda)',
                surveyor_remarks: 'Pending on-ground RTK boundary verification.',
                created_at: '04-Sep-2026'
            },
            {
                application_no: 'PART-2026-000284',
                ulpin: '79Q547VSKP0001',
                survey_number: 'Sy. No. 1/1',
                applicant_name: 'Waltair Commercial Authority',
                phone: '+91 98480 11223',
                mutation_type: 'Partition / Family Settlement',
                deed_ref: 'AP/SRO/VSKP/2026/000284',
                current_stage: 4, // Mutated
                notice_days_remaining: 0,
                status: 'Stage 4: RoR Mutated & Cadastral Map Updated',
                surveyor_assigned: 'Mandal Cadastral Surveyor (Dwaraka Nagar)',
                surveyor_remarks: 'Complete. Form 1-B issued with digital signature.',
                created_at: '28-Aug-2026'
            }
        ],

        // Event Listeners
        listeners: {},

        on: function(event, callback) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push(callback);
        },

        emit: function(event, data) {
            if (this.listeners[event]) {
                this.listeners[event].forEach(cb => cb(data));
            }
        },

        setRole: function(role) {
            this.currentRole = role;
            sessionStorage.setItem('landstack_prime_role', role);
            this.emit('roleChange', role);
            this.showToast(`Switched workspace to: ${this.getRoleTitle(role)}`);
        },

        getRoleTitle: function(role) {
            switch(role) {
                case 'citizen': return 'Citizen Bhu-Aadhaar Vault';
                case 'surveyor': return 'Mandal Cadastral Surveyor Desk';
                case 'tahsildar': return 'Office of the Tahasildar / MRO';
                case 'sro': return 'Sub-Registrar (SRO) Deed Registration';
                case 'collector': return 'District Collector War Room';
                default: return 'Public Portal';
            }
        },

        setActiveParcel: function(feature) {
            this.activeParcel = feature;
            this.activeParcelId = feature ? feature.properties.id : null;
            this.emit('parcelSelected', feature);
        },

        showToast: function(message, icon = 'fas fa-info-circle') {
            const toast = document.getElementById('prime-toast');
            if (!toast) return;
            toast.innerHTML = `<i class="${icon}"></i> <span>${message}</span>`;
            toast.classList.add('show');
            clearTimeout(this._toastTimeout);
            this._toastTimeout = setTimeout(() => {
                toast.classList.remove('show');
            }, 3200);
        },

        formatINR: function(num) {
            if (isNaN(num)) return '₹ 0';
            return '₹ ' + Number(num).toLocaleString('en-IN');
        },

        formatArea: function(sqft) {
            if (!sqft || isNaN(sqft)) return '0 Sq.Ft';
            const s = Number(sqft);
            const sqyds = (s / 9).toFixed(1);
            const cents = (s / 435.6).toFixed(2);
            return `${s.toLocaleString('en-IN')} Sq.Ft (${sqyds} Sq.Yds • ${cents} Cts)`;
        }
    };

    window.LandStackState = LandStackState;

})(window);
