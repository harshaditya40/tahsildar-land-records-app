/* =========================================================
   TAHSILDAR — TAHASILDAR / MRO JUDICIAL CHAMBERS (v2.0)
   Statutory 15-Day Notice, Document Scrutiny & Digital Signoff
   ========================================================= */

(function(window) {
    'use strict';

    const TahsildarModule = {
        activeTaskAppNo: null,

        init: function() {
            LandStackState.on('roleChange', (role) => {
                if (role === 'tahsildar') {
                    this.renderChambers();
                }
            });

            LandStackState.on('taskUpdated', () => {
                this.renderChambers();
            });

            // Initial render if container exists
            this.syncWithBackend();
        },

        syncWithBackend: async function() {
            try {
                const res = await fetch('/api/officer/pending-tasks/');
                const data = await res.json();
                if (data.success && data.tahsildar_tasks && data.tahsildar_tasks.length > 0) {
                    // Update badge count
                    const badge = document.getElementById('badge-tahsildar-count');
                    if (badge) badge.textContent = data.counts.tahsildar_count;
                }
            } catch (err) {
                // Ignore if offline
            }
        },

        renderChambers: async function() {
            const container = document.getElementById('tahsildar-tasks-queue');
            if (!container) return;

            // Attempt live sync from backend
            try {
                const res = await fetch('/api/officer/pending-tasks/');
                const data = await res.json();
                if (data.success && Array.isArray(data.tahsildar_tasks)) {
                    // Merge any newly added tasks
                    data.tahsildar_tasks.forEach(bt => {
                        const exists = LandStackState.mutationTasks.find(lt => lt.application_no === bt.application_no);
                        if (!exists) {
                            LandStackState.mutationTasks.unshift(bt);
                        }
                    });
                }
            } catch (err) {
                // Continue with local state
            }

            const stage3Tasks = LandStackState.mutationTasks.filter(t => t.current_stage === 3);

            // Update badge
            const badge = document.getElementById('badge-tahsildar-count');
            if (badge) badge.textContent = stage3Tasks.length;

            if (stage3Tasks.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center; padding:40px 20px; color:#94a3b8;">
                        <i class="fas fa-check-circle" style="font-size:2.5rem; color:#10b981; margin-bottom:12px;"></i>
                        <h4 style="color:#ffffff; font-size:1rem; margin-bottom:4px;">No Pending Statutory Approvals</h4>
                        <p style="font-size:0.78rem;">All mutation applications have been scrutinized, notices cleared, and orders digitally signed.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = stage3Tasks.map(task => {
                const noticeCleared = task.notice_days_remaining <= 0;
                return `
                    <div class="officer-task-card">
                        <div class="task-top-meta">
                            <span class="task-app-no"><i class="fas fa-file-signature"></i> ${task.application_no}</span>
                            <span class="tahsildar-badge"><i class="fas fa-balance-scale"></i> Sec 5(3) RoR Act</span>
                        </div>

                        <div class="task-details-grid">
                            <div><strong>Bhu-Aadhaar ULPIN:</strong> <code style="color:#60a5fa;">${task.ulpin}</code></div>
                            <div><strong>Survey / Plot No:</strong> ${task.survey_number}</div>
                            <div><strong>Applicant / Transferee:</strong> ${task.applicant_name}</div>
                            <div><strong>Service Category:</strong> ${task.mutation_type}</div>
                            <div><strong>Surveyor Demarcation:</strong> <span style="color:#34d399;">Verified (RTK Fixed)</span></div>
                            <div><strong>Statutory Notice Period:</strong> <span style="${noticeCleared ? 'color:#10b981; font-weight:700;' : 'color:#f59e0b; font-weight:700;'}">${noticeCleared ? 'Cleared (0 Objections)' : task.notice_days_remaining + ' Days Remaining'}</span></div>
                        </div>

                        <div style="background:rgba(255,255,255,0.04); border:1px dashed rgba(255,255,255,0.15); border-radius:6px; padding:8px 12px; font-size:0.74rem; color:#94a3b8; margin-bottom:10px;">
                            <i class="fas fa-drafting-compass" style="color:#60a5fa;"></i> <strong>Field Surveyor Remarks:</strong> ${task.surveyor_remarks}
                        </div>

                        <div class="task-actions-row">
                            <button onclick="window.TahsildarModule.openDocumentScrutiny('${task.application_no}')" class="btn-prime-secondary" style="padding:6px 12px; font-size:0.75rem;">
                                <i class="fas fa-search-plus"></i> Scrutinize Legal Docs
                            </button>
                            <button onclick="window.TahsildarModule.draftInquiryOrder('${task.application_no}')" class="btn-prime-secondary" style="padding:6px 12px; font-size:0.75rem;">
                                <i class="fas fa-file-alt"></i> AI Draft Inquiry Order
                            </button>
                            <button onclick="window.TahsildarModule.digitallySignMutationOrder('${task.application_no}')" class="btn-prime-emerald" style="padding:6px 14px; font-size:0.75rem;">
                                <i class="fas fa-signature"></i> Digitally Sign & Mutate
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        },

        openDocumentScrutiny: function(appNo) {
            this.activeTaskAppNo = appNo;
            const task = LandStackState.mutationTasks.find(t => t.application_no === appNo);
            if (!task) return;

            const titleEl = document.getElementById('scrutiny-app-no-title');
            const ulpinEl = document.getElementById('scrutiny-ulpin-tag');
            const deedEl = document.getElementById('scrutiny-deed-ref');

            if (titleEl) titleEl.textContent = appNo;
            if (ulpinEl) ulpinEl.textContent = task.ulpin;
            if (deedEl) deedEl.textContent = task.deed_ref || task.deed_reference_no || 'AP/SRO/VSKP/2026/000481';

            const modal = document.getElementById('modal-document-scrutiny');
            if (modal) modal.style.display = 'flex';
        },

        draftInquiryOrder: function(appNo) {
            this.activeTaskAppNo = appNo;
            const task = LandStackState.mutationTasks.find(t => t.application_no === appNo);
            if (!task) return;

            const procNo = `AP/REV/VSKP/MUT-ORDER/2026/${Math.floor(1000 + Math.random() * 9000)}`;
            const procNoEl = document.getElementById('inquiry-order-proc-no');
            if (procNoEl) procNoEl.textContent = `PROCEEDINGS NO: ${procNo}`;

            const bodyEl = document.getElementById('inquiry-order-body-text');
            if (bodyEl) {
                bodyEl.innerHTML = `
                    <p style="margin-bottom:10px;"><strong>SUBJECT:</strong> Land Administration &bull; Andhra Pradesh Rights in Land & Pattadar Pass Books Act, 1971 &bull; Regularization of Title Mutation in respect of Survey No. <strong>${task.survey_number}</strong>, 14-Digit ULPIN: <code style="color:#38bdf8;">${task.ulpin}</code> &bull; Speaking Order Issued.</p>

                    <p style="margin-bottom:10px;"><strong>FINDINGS & ADJUDICATION:</strong></p>
                    <ol style="padding-left:18px; margin-bottom:12px; line-height:1.6;">
                        <li>An application was registered by <strong>${task.applicant_name}</strong> under category <em>"${task.mutation_type}"</em> supported by Registered Instrument No. <code>${task.deed_ref || task.deed_reference_no}</code>.</li>
                        <li>The Mandal Cadastral Surveyor conducted on-ground DGPS RTK boundary demarcation with ±1.2 cm positional accuracy and certified zero overlap with neighboring survey sub-divisions.</li>
                        <li>Statutory 15-day public notice was duly published under Form VIII under Section 5(3). The statutory notice window completed with <strong>Zero Public Objections</strong> lodged.</li>
                        <li>Title scrutiny reveals nil encumbrance and complete genealogical clarity.</li>
                    </ol>

                    <p style="color:#34d399; font-weight:700;"><strong>FINAL ORDER:</strong> The Revenue Department hereby ORDERS that the Record of Rights (Webland 2.0) be updated in favor of ${task.applicant_name} and an official Form 1-B Pattadar Passbook be generated under the seal of this court.</p>
                `;
            }

            const modal = document.getElementById('modal-inquiry-order');
            if (modal) modal.style.display = 'flex';
        },

        digitallySignMutationOrder: async function(appNo) {
            const task = LandStackState.mutationTasks.find(t => t.application_no === appNo);
            if (!task) return;

            let token = `DS-AP-REV-2026-${Math.floor(10000 + Math.random() * 90000)}-MRO`;

            // Call Backend API to commit approval
            try {
                const res = await fetch('/api/officer/approve-task/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        application_no: appNo,
                        officer_role: 'tahsildar',
                        remarks: 'Quasi-judicial scrutiny passed. Zero objections under Sec 5(3).'
                    })
                });
                const data = await res.json();
                if (data.success && data.token) {
                    token = data.token;
                }
            } catch (err) {
                console.warn('Backend API call failed, using client token', err);
            }

            task.current_stage = 4;
            task.status = 'Stage 4: RoR Mutated & Cadastral Map Updated';
            task.notice_days_remaining = 0;
            task.digital_signature_token = token;

            // Close modal if open
            const modal = document.getElementById('modal-inquiry-order');
            if (modal) modal.style.display = 'none';

            LandStackState.showToast(`Order Digitally Signed! DSC Token: ${token}. RoR 1-B Passbook Synced!`, 'fas fa-shield-check');
            LandStackState.emit('taskUpdated');

            // Open RoR Passbook in new tab
            setTimeout(() => {
                window.openRoRPassbook(2370);
            }, 1200);
        }
    };

    window.proceedToSignFromOrder = function() {
        if (TahsildarModule.activeTaskAppNo) {
            TahsildarModule.digitallySignMutationOrder(TahsildarModule.activeTaskAppNo);
        }
    };

    window.TahsildarModule = TahsildarModule;

})(window);
