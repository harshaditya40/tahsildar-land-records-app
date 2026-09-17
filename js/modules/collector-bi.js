/* =========================================================
   LANDSTACK PRIME - DISTRICT COLLECTOR BI WAR ROOM (v2.0)
   Executive Decision Support, Revenue Analytics & CRZ Matrix
   ========================================================= */

(function(window) {
    'use strict';

    const CollectorBIModule = {
        openDashboard: function() {
            const modal = document.getElementById('modal-collector-bi');
            if (!modal) return;

            const data = window.ANALYTICS_DATA || {};
            const kpis = data.kpis || {};

            // Update Top-line KPI Cards
            document.getElementById('col-kpi-parcels').textContent = kpis.total_parcels || 256;
            document.getElementById('col-kpi-acres').textContent = kpis.total_area_acres || 599.9;
            document.getElementById('col-kpi-val').textContent = kpis.total_valuation_crores || '3,920.3';
            
            document.getElementById('col-kpi-tax-eff').textContent = `${kpis.tax_efficiency_pct || 28.6}%`;
            document.getElementById('col-kpi-tax-col').textContent = '2.88';
            document.getElementById('col-kpi-tax-dem').textContent = '10.08';

            document.getElementById('col-kpi-dispute-rate').textContent = `${kpis.dispute_pct || 1.6}%`;
            document.getElementById('col-kpi-dispute-count').textContent = kpis.disputed_count || 4;
            document.getElementById('col-kpi-dispute-acres').textContent = kpis.disputed_acres || 0.83;

            document.getElementById('col-kpi-sla-avg').textContent = '4.2';
            document.getElementById('col-kpi-sla-comp').textContent = '96.8%';

            // Populate Circles Breakdown Table
            this.renderCircleBreakdown();

            modal.style.display = 'flex';
        },

        renderCircleBreakdown: function() {
            const tbody = document.getElementById('tbody-collector-circles');
            if (!tbody) return;

            const circles = [
                { name: 'Madhurawada IT Circle', parcels: 52, acres: '142.4 Ac', val: '₹ 1,120 Cr', tax: '38.4%', dispute: '0 Plots' },
                { name: 'Rushikonda Coastal Corridor', parcels: 44, acres: '118.2 Ac', val: '₹ 980 Cr', tax: '42.1%', dispute: '1 Plot' },
                { name: 'Gajuwaka Industrial Belt', parcels: 48, acres: '135.0 Ac', val: '₹ 750 Cr', tax: '24.8%', dispute: '2 Plots' },
                { name: 'Siripuram Executive Zone', parcels: 36, acres: '64.5 Ac', val: '₹ 540 Cr', tax: '52.0%', dispute: '0 Plots' },
                { name: 'MVP Colony Residential Sector', parcels: 40, acres: '78.8 Ac', val: '₹ 380 Cr', tax: '46.5%', dispute: '1 Plot' },
                { name: 'Dwaraka Nagar Commercial Hub', parcels: 35, acres: '61.0 Ac', val: '₹ 150 Cr', tax: '31.2%', dispute: '0 Plots' }
            ];

            tbody.innerHTML = circles.map(c => `
                <tr>
                    <td style="font-weight:700; color:#ffffff;">${c.name}</td>
                    <td>${c.parcels}</td>
                    <td>${c.acres}</td>
                    <td style="color:#34d399; font-weight:700;">${c.val}</td>
                    <td>${c.tax}</td>
                    <td><span class="${c.dispute === '0 Plots' ? 'result-badge badge-available' : 'result-badge badge-disputed'}" style="font-size:0.65rem;">${c.dispute}</span></td>
                </tr>
            `).join('');
        },

        printDossier: function() {
            window.print();
        }
    };

    window.CollectorBIModule = CollectorBIModule;

})(window);
