/* =========================================================
   LANDSTACK PRIME - HACKATHON JUDGE PITCHDECK & TOUR (v2.0)
   1-Click Interactive Walkthrough & Executive Pitch Slides
   ========================================================= */

(function(window) {
    'use strict';

    const PitchDeckModule = {
        currentSlide: 0,
        currentTourStep: 0,

        slides: [
            {
                tag: 'PROBLEM STATEMENT • SIH26014',
                title: 'Fragmented Land Governance in India',
                subtitle: 'Over 66% of all civil litigation in Indian courts stems from land and property disputes, locking up ₹1.5 Lakh Crores in stagnant capital.',
                pillars: [
                    { icon: 'fas fa-map-marked-alt', title: 'Disconnected Maps', desc: 'Paper and CAD maps are not georeferenced with revenue records, enabling illegal encroachment.' },
                    { icon: 'fas fa-file-contract', title: 'Siloed SRO Deeds', desc: 'Sub-Registrars register deeds without real-time cadastral validation, leading to fraudulent double sales.' },
                    { icon: 'fas fa-hourglass-half', title: 'Months-Long Mutations', desc: 'Manual Form 6 notices and physical Tahsildar signatures take 60–180 days with rampant corruption.' }
                ]
            },
            {
                tag: 'THE ARCHITECTURAL SOLUTION',
                title: 'TAHSILDAR: Digital Public Infrastructure (DPI)',
                subtitle: 'A single, interoperable state-level spatial fabric anchored by the Government of India’s 14-Digit ULPIN (Bhu-Aadhaar).',
                pillars: [
                    { icon: 'fas fa-fingerprint', title: '14-Digit ULPIN Standard', desc: 'Every square inch of land receives an immutable Bhu-Aadhaar code derived from WGS84 coordinates.' },
                    { icon: 'fas fa-bolt', title: 'Instant SRO Auto-Mutation', desc: 'Deed registration immediately triggers cadastral mutation without manual paper file movement.' },
                    { icon: 'fas fa-shield-alt', title: 'Tahsildar Cryptographic Signoff', desc: 'Automated 15-day public notice countdowns and PKI digital tokens update Webland 2.0.' }
                ]
            },
            {
                tag: 'TECHNICAL INNOVATION & EXCELLENCE',
                title: 'Mathematical Precision & Autonomous AI',
                subtitle: 'Combining client-side computational geometry with satellite telemetry and generative legal intelligence.',
                pillars: [
                    { icon: 'fas fa-cut', title: 'Turf.js Geodesic Pothissing', desc: 'Bisects cadastral polygons with ±0.01% closed-ring tolerance, automatically deriving child ULPINs.' },
                    { icon: 'fas fa-satellite', title: 'SVAMITVA Drone DGPS', desc: 'Ingests sub-centimeter RTK GNSS GCP telemetry with live baseline discrepancy detection.' },
                    { icon: 'fas fa-brain', title: 'Bhu-AI Legal Risk Radar', desc: 'Instant title audit scanning encumbrances, CRZ violations, and bilingual English/Telugu translation.' }
                ]
            },
            {
                tag: 'EXECUTIVE ROI & IMPACT',
                title: 'Million-Dollar Governance Transformation',
                subtitle: 'Demonstrated in the Visakhapatnam pilot covering 256 parcels, 599.9 acres, and ₹3,920 Crores in land valuation.',
                pillars: [
                    { icon: 'fas fa-tachometer-alt', title: '4.2 Days Turnaround', desc: 'Reduced mutation completion from 60+ days down to 4.2 days (96.8% statutory SLA compliance).' },
                    { icon: 'fas fa-coins', title: '₹10.08 Cr Tax Realization', desc: 'Unified municipal GVMC property tax records, boosting revenue collections by 28.6%.' },
                    { icon: 'fas fa-gavel', title: '1.6% Dispute Rate', desc: 'Reduced contested land titles to near-zero through public spatial transparency.' }
                ]
            }
        ],

        tourSteps: [
            {
                title: 'Step 1: Citizen Bhu-Aadhaar Vault',
                text: 'Demonstrating citizen transparency: Sri K. Rama Rao logs in with Aadhaar to access his verified property portfolio with live GPS location.',
                action: function() {
                    LandStackState.setRole('citizen');
                    CitizenModule.locateProperty(17.8383, 83.3595, '79Q5CNX8ICNOEL', 2370);
                }
            },
            {
                title: 'Step 2: SRO Instant Deed Auto-Mutation',
                text: 'Eliminating duplicate sales: Sub-Registrar logs a Sale Deed, instantly creating a linked mutation task without manual delays.',
                action: function() {
                    LandStackState.setRole('sro');
                    SROModule.openDeedModal(LandStackState.activeParcel);
                }
            },
            {
                title: 'Step 3: Turf.js Geodesic Pothissing (Subdivision)',
                text: 'Mathematical precision: Mandal Surveyor cuts a plot with Turf.js geodesic bisection, enforcing 100% closed-ring tolerance.',
                action: function() {
                    LandStackState.setRole('surveyor');
                    const modal = document.getElementById('modal-sro-deed');
                    if (modal) modal.style.display = 'none';
                    PothissingEngine.startSubdivision(LandStackState.activeParcel);
                }
            },
            {
                title: 'Step 4: Tahasildar Judicial Scrutiny & e-Sign',
                text: 'Quasi-judicial oversight: Tahasildar audits 15-day notice compliance and executes cryptographic digital signature to update Webland 2.0.',
                action: function() {
                    LandStackState.setRole('tahsildar');
                    TahsildarModule.renderChambers();
                }
            },
            {
                title: 'Step 5: District Collector Executive BI War Room',
                text: 'High-level command: The District Collector monitors district-wide KPIs, tax demand, and CRZ regulatory compliance in real time.',
                action: function() {
                    LandStackState.setRole('collector');
                    CollectorBIModule.openDashboard();
                }
            }
        ],

        openPitchModal: function() {
            this.currentSlide = 0;
            this.renderSlide();
            document.getElementById('modal-pitchdeck').style.display = 'flex';
        },

        renderSlide: function() {
            const slide = this.slides[this.currentSlide];
            document.getElementById('pitch-slide-tag').textContent = slide.tag;
            document.getElementById('pitch-slide-title').textContent = slide.title;
            document.getElementById('pitch-slide-subtitle').textContent = slide.subtitle;

            const grid = document.getElementById('pitch-pillars-grid');
            grid.innerHTML = slide.pillars.map(p => `
                <div class="pitch-card-pillar">
                    <div class="pillar-icon-box"><i class="${p.icon}"></i></div>
                    <h4>${p.title}</h4>
                    <p>${p.desc}</p>
                </div>
            `).join('');

            // Dots
            const dotsContainer = document.getElementById('pitch-slide-dots');
            dotsContainer.innerHTML = this.slides.map((s, idx) => `
                <div class="slide-dot ${idx === this.currentSlide ? 'active' : ''}" onclick="window.PitchDeckModule.goToSlide(${idx})"></div>
            `).join('');
        },

        nextSlide: function() {
            if (this.currentSlide < this.slides.length - 1) {
                this.currentSlide++;
                this.renderSlide();
            }
        },

        prevSlide: function() {
            if (this.currentSlide > 0) {
                this.currentSlide--;
                this.renderSlide();
            }
        },

        goToSlide: function(idx) {
            this.currentSlide = idx;
            this.renderSlide();
        },

        startJudgeTour: function() {
            document.getElementById('modal-pitchdeck').style.display = 'none';
            this.currentTourStep = 0;
            this.renderTourStep();
            document.getElementById('prime-tour-banner').style.display = 'flex';
        },

        renderTourStep: function() {
            const step = this.tourSteps[this.currentTourStep];
            document.getElementById('tour-step-badge').textContent = `STAGE ${this.currentTourStep + 1} OF 5`;
            document.getElementById('tour-instruction-text').innerHTML = `<strong>${step.title}:</strong> ${step.text}`;
            
            // Execute step action
            step.action();
        },

        nextTourStep: function() {
            if (this.currentTourStep < this.tourSteps.length - 1) {
                this.currentTourStep++;
                this.renderTourStep();
            } else {
                this.endTour();
                LandStackState.showToast('🏆 Hackathon Evaluation Walkthrough Completed! Ready for Jury Q&A.', 'fas fa-trophy');
            }
        },

        prevTourStep: function() {
            if (this.currentTourStep > 0) {
                this.currentTourStep--;
                this.renderTourStep();
            }
        },

        endTour: function() {
            document.getElementById('prime-tour-banner').style.display = 'none';
        }
    };

    window.PitchDeckModule = PitchDeckModule;

})(window);
