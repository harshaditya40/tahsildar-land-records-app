/**
 * TAHSILDAR - LAND RECORDS & SERVICES (SIH26014)
 * Centralized API & DPI Service Layer
 * 
 * Provides unified interface for Cadastral GIS, Citizen Form 6-A,
 * Tahasildar Digital Chambers, SRO Deed Linkage, and Analytics.
 */

(function(window) {
    'use strict';

    const BASE_URL = window.location.origin;

    // Core HTTP Request Handler with Error Handling & Auth Interception
    async function request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
        
        const defaultHeaders = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };

        // Attach officer auth header if present
        const isOfficer = sessionStorage.getItem('landstack_officer_auth') === 'true';
        if (isOfficer) {
            defaultHeaders['X-Officer-Auth'] = 'OFFICER_AUTH_2026';
            defaultHeaders['X-Officer-PIN'] = '2026';
        }

        const config = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...(options.headers || {})
            }
        };

        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url, config);
            if (!response.ok) {
                let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
                try {
                    const errJson = await response.json();
                    if (errJson.message || errJson.error) {
                        errorMsg = errJson.message || errJson.error;
                    }
                } catch (_) {}
                throw new Error(errorMsg);
            }
            return await response.json();
        } catch (error) {
            console.warn(`[ApiService] Request to ${endpoint} failed:`, error.message);
            throw error;
        }
    }

    const ApiService = {
        // 1. Parcels & Cadastral GIS Service
        parcels: {
            async getMapData() {
                try {
                    return await request('/api/parcels/map_data/');
                } catch (err) {
                    console.warn('[ApiService] Falling back to preloaded parcel data');
                    if (window.PARCELS_GEOJSON && window.PARCELS_GEOJSON.features) {
                        return window.PARCELS_GEOJSON.features.map(f => f.properties);
                    }
                    return [];
                }
            },

            async getGeoJson() {
                try {
                    return await request('/api/parcels/geojson/');
                } catch (err) {
                    if (window.PARCELS_GEOJSON) return window.PARCELS_GEOJSON;
                    throw err;
                }
            },

            async subdivide(parcelId, subdivisionData) {
                return await request(`/api/parcels/${parcelId}/subdivide/`, {
                    method: 'POST',
                    body: subdivisionData
                });
            },

            async registerSroDeed(parcelId, deedData) {
                return await request(`/api/parcels/${parcelId}/register-sro-deed/`, {
                    method: 'POST',
                    body: deedData
                });
            }
        },

        // 2. Authentication & Session Service
        auth: {
            async verifyOfficerPin(pin) {
                return await request('/api/officer/verify-pin/', {
                    method: 'POST',
                    body: { pin: pin }
                });
            },

            async logout() {
                sessionStorage.removeItem('landstack_officer_auth');
                sessionStorage.removeItem('tahsildar_role');
                sessionStorage.setItem('landstack_role', 'citizen');
                try {
                    await request('/api/officer/logout/', { method: 'POST' });
                } catch (_) {}
            },

            getCurrentRole() {
                const urlRole = new URLSearchParams(window.location.search).get('role');
                if (urlRole) return urlRole.toLowerCase();
                return sessionStorage.getItem('landstack_role') || 'citizen';
            },

            isOfficerAuthenticated() {
                return sessionStorage.getItem('landstack_officer_auth') === 'true';
            },

            getCitizenPortfolio() {
                try {
                    const raw = sessionStorage.getItem('landstack_citizen_ulpins');
                    if (raw) return JSON.parse(raw);
                } catch (_) {}
                return ['79Q5CNX8ICNOELA', '79Q5RUS004501'];
            }
        },

        // 3. Citizen Mutations & Form 6-A Lifecycle
        mutations: {
            async apply(applicationPayload) {
                return await request('/api/citizen/apply-mutation/', {
                    method: 'POST',
                    body: applicationPayload
                });
            },

            async track(appNo, ulpin) {
                let q = '';
                if (appNo) q += `app_no=${encodeURIComponent(appNo)}`;
                if (ulpin) q += `${q ? '&' : ''}ulpin=${encodeURIComponent(ulpin)}`;
                return await request(`/api/citizen/track-mutation/?${q}`);
            },

            async advanceStage(appNo) {
                return await request('/api/citizen/advance-stage/', {
                    method: 'POST',
                    body: { application_no: appNo }
                });
            },

            async getRecentApplications() {
                return await request('/api/citizen/recent-applications/');
            }
        },

        // 4. Officer Judicial Chambers & Statutory Scrutiny
        officer: {
            async getPendingTasks() {
                return await request('/api/officer/pending-tasks/');
            },

            async approveTask(approvalData) {
                return await request('/api/officer/approve-task/', {
                    method: 'POST',
                    body: approvalData
                });
            },

            async verifyDocument(appNo, docId, remarks) {
                return await request('/api/officer/verify-document/', {
                    method: 'POST',
                    body: {
                        application_no: appNo,
                        doc_id: docId,
                        remarks: remarks || 'Verified against SRO / Revenue Sub-Registrar records'
                    }
                });
            }
        },

        // 5. Collector BI & Analytics Dashboard
        analytics: {
            async getDashboard() {
                try {
                    return await request('/api/analytics/dashboard/');
                } catch (err) {
                    if (window.ANALYTICS_DATA) return window.ANALYTICS_DATA;
                    throw err;
                }
            }
        }
    };

    window.ApiService = ApiService;

})(window);
