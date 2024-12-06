// ==UserScript==
// @name         Rimworld Workshop Mod Compatibility Checker
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Displays mod compatibility information from Google Spreadsheet on Steam Workshop pages
// @author       jakedev796
// @match        https://steamcommunity.com/sharedfiles/*
// @match        https://steamcommunity.com/workshop/browse*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    let currentInfoPanel = null;

    // Configuration
    const SPREADSHEET_ID = '1jaDxV8F7bcz4E9zeIRmZGKuaX7d0kvWWq28aKckISaY';
    const SHEETS = [
        { version: '1.4/1.5', gid: '1144921800', note: 'Note: This list includes both 1.4 and 1.5 mods' },
        { version: '1.3', gid: '278315082' },
        { version: '1.1/1.2', gid: '149201791' },
        { version: '1.0', gid: '0' }
    ];

    const STATUS_DESCRIPTIONS = {
        'untested': 'Untested - Compatibility with multiplayer has not been verified',
        '1': 'Does not work - The mod is not compatible with multiplayer',
        '2': 'Major issues - The mod works but has significant features that do not function in multiplayer',
        '3': 'Minor issues - The mod works with some minor features not functioning in multiplayer',
        '4': 'Fully compatible - All features work correctly in multiplayer'
    };

    // Cache configuration
    const CACHE_CONFIG = {
        KEY: 'rimworld_mp_compatibility_data',
        TIMESTAMP_KEY: 'rimworld_mp_compatibility_timestamp',
        DURATION: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    };

    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .loader {
            border: 3px solid #316282;
            border-top: 3px solid #4c6b22;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
            margin: 10px auto;
        }
    `;
    document.head.appendChild(style);

    // Cache management class
    class CompatibilityCache {
        constructor() {
            this.data = null;
            this.timestamp = null;
            this.isLoading = false;
            this.initialized = false;
            this.initializeCache();
        }

        async initializeCache() {
            
            this.isLoading = true;

            try {
                const cachedData = localStorage.getItem(CACHE_CONFIG.KEY);
                const cachedTimestamp = localStorage.getItem(CACHE_CONFIG.TIMESTAMP_KEY);

                if (cachedData && cachedTimestamp) {
                    try {
                        this.data = JSON.parse(cachedData);
                        this.timestamp = parseInt(cachedTimestamp);
                        this.initialized = true;
                        if (this.isExpired()) {
                            await this.refreshCache();
                        }
                    } catch (parseError) {
                        await this.refreshCache();
                    }
                } else {
                    await this.refreshCache();
                }
            } catch (error) {
                this.updateStatusIndicator('error');
                this.initialized = true;
            } finally {
                this.isLoading = false;
            }
        }

        isExpired() {
            return !this.timestamp || (Date.now() - this.timestamp > CACHE_CONFIG.DURATION);
        }

        async refreshCache() {
            // Don't return early if we're loading during initialization
            if (this.isLoading && this.initialized) {
                return;
            }

            this.isLoading = true;
            this.updateStatusIndicator('loading');

            try {
                const allData = {};
                for (const sheet of SHEETS) {
                    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${sheet.gid}`;
                    const response = await this.fetchSheet(url);
                    
                    allData[sheet.gid] = this.parseCSV(response);
                }

                this.data = allData;
                this.timestamp = Date.now();
                this.initialized = true;

                localStorage.setItem(CACHE_CONFIG.KEY, JSON.stringify(this.data));
                localStorage.setItem(CACHE_CONFIG.TIMESTAMP_KEY, this.timestamp.toString());

                this.updateStatusIndicator('success');
                
            } catch (error) {
                
                this.updateStatusIndicator('error');
                throw error;
            } finally {
                this.isLoading = false;
            }
        }

        createStatusIndicator() {
            const indicator = document.createElement('div');
            indicator.id = 'mp-compatibility-status';
            indicator.style.cssText = `
                display: inline-flex;
                align-items: center;
                margin-right: 10px;
                padding: 5px 10px;
                border-radius: 3px;
                font-size: 12px;
                cursor: pointer;
            `;

            const globalHeader = document.querySelector('#global_header .content');
            if (globalHeader) {
                globalHeader.appendChild(indicator);
            }

            return indicator;
        }

        updateStatusIndicator(status) {
            let indicator = document.getElementById('mp-compatibility-status');
            if (!indicator) {
                indicator = this.createStatusIndicator();
            }

            const statusConfig = {
                loading: { text: 'MP Compatibility: Loading...', color: '#ffd700' },
                success: { text: 'MP Compatibility: Ready', color: '#4caf50' },
                error: { text: 'MP Compatibility: Error', color: '#ff4444' },
                expired: { text: 'MP Compatibility: Update Available', color: '#ff8c1a' }
            };

            const config = statusConfig[status];
            indicator.style.color = config.color;
            indicator.textContent = config.text;
            indicator.onclick = async () => {
                if (!this.isLoading) {
                    try {
                        await this.refreshCache();
                        showToast('Compatibility data updated successfully!');
                    } catch (error) {
                        showToast('Failed to update compatibility data. Please try again later.', true);
                    }
                }
            };
        }

      async fetchSheet(url) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: { "Content-Type": "text/csv" },
                    onload: function(response) {
                        if (response.status === 200) {
                            resolve(response.responseText);
                        } else {
                            reject(`Failed to fetch data (Status: ${response.status})`);
                        }
                    },
                    onerror: reject
                });
            });
        }

        parseCSV(csv) {
            const lines = csv.split('\n');
            return lines.map(line => {
                const rows = [];
                let field = '';
                let inQuotes = false;

                for (let i = 0; i < line.length; i++) {
                    if (line[i] === '"') {
                        inQuotes = !inQuotes;
                    } else if (line[i] === ',' && !inQuotes) {
                        rows.push(field.trim());
                        field = '';
                    } else {
                        field += line[i];
                    }
                }
                rows.push(field.trim());
                return rows;
            });
        }

        getModInfo(modId, sheetGid) {
            if (!this.data || !this.data[sheetGid]) return null;

            const sheetData = this.data[sheetGid];
            const STATUS_COL = 0;
            const STEAM_ID_COL = 2;
            const NOTES_COL = 5;

            for (let i = 1; i < sheetData.length; i++) {
                const row = sheetData[i];
                if (row[STEAM_ID_COL] === modId) {
                    return {
                        status: row[STATUS_COL],
                        notes: row[NOTES_COL] || 'No notes available'
                    };
                }
            }

            return {
                status: 'untested',
                notes: 'Unable to find mod ID in the compatibility spreadsheet. Be aware that compatibility with this mod is not tested.'
            };
        }

        getLastUpdated() {
            return this.timestamp ? new Date(this.timestamp).toLocaleString() : 'Never';
        }
    }

    // Create global cache instance
    const compatibilityCache = new CompatibilityCache();

    // Helper Functions
    function getModId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }

    function isRimworldModPage() {
        

        // Check URL first
        const isWorkshopUrl = window.location.href.includes('/sharedfiles/filedetails/');
        

        // Check for RimWorld content
        const hasRimWorldText = document.body.textContent.includes('RimWorld');
        const hasRimWorldHeader = document.querySelector('.apphub_AppName')?.textContent.includes('RimWorld');

        return isWorkshopUrl && (hasRimWorldText || hasRimWorldHeader);
    }

    function detectModVersion() {
        const defaultVersion = getDefaultVersion();
        if (defaultVersion) {
            return defaultVersion;
        }

        const detailsBlock = document.querySelector('.rightDetailsBlock');
        if (detailsBlock) {
            const versionLinks = Array.from(detailsBlock.getElementsByTagName('a'))
                .filter(a => a.textContent.match(/^1\.[0-5]$/))
                .map(a => a.textContent);

            if (versionLinks.length > 0) {
                const versions = versionLinks.sort((a, b) => parseFloat(b) - parseFloat(a));
                const highestVersion = versions[0];

                if (highestVersion >= '1.4') return SHEETS[0].gid;
                if (highestVersion === '1.3') return SHEETS[1].gid;
                if (highestVersion === '1.2' || highestVersion === '1.1') return SHEETS[2].gid;
                if (highestVersion === '1.0') return SHEETS[3].gid;
            }
        }

        return SHEETS[0].gid;
    }

    function showToast(message, isError = false) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${isError ? '#ff4444' : '#4c6b22'};
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 9999;
            transition: opacity 0.3s;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function getDefaultVersion() {
        return GM_getValue('defaultVersion', null);
    }

    function setDefaultVersion(version) {
        GM_setValue('defaultVersion', version);
        const versionName = SHEETS.find(s => s.gid === version)?.version || 'Unknown';
        showToast(`Default version set to ${versionName}`);
    }

    function createErrorPanel(errorMessage) {
    const panel = document.createElement('div');
    panel.style.cssText = `
        background-color: #1b2838;
        border: 1px solid #ff4444;
        border-radius: 3px;
        padding: 10px;
        margin: 10px 0;
        color: #ff4444;
        font-size: 14px;
    `;

    panel.innerHTML = `
        <strong>RimWorld Multiplayer Compatibility</strong><br><br>
        ${errorMessage}
    `;

    if (currentInfoPanel) {
        currentInfoPanel.replaceWith(panel);
        currentInfoPanel = panel;
    } else {
        const descriptionElement = document.querySelector('.workshopItemDescription');
        if (descriptionElement) {
            descriptionElement.parentElement.insertBefore(panel, descriptionElement);
            currentInfoPanel = panel;
        }
      }
    }

    function createInfoPanel(modInfo, sheet = SHEETS[0], selectedGid = SHEETS[0].gid) {
        const panel = document.createElement('div');
        panel.style.cssText = `
            background-color: #1b2838;
            border: 1px solid #4c6b22;
            border-radius: 3px;
            padding: 10px;
            margin: 10px 0;
            color: #acb2b8;
            font-size: 14px;
        `;

        // Title
        const titleDiv = document.createElement('div');
        titleDiv.style.cssText = `
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 15px;
            color: #ffffff;
            text-align: center;
            border-bottom: 1px solid #4c6b22;
            padding-bottom: 10px;
        `;
        titleDiv.textContent = 'RimWorld Multiplayer Compatibility';
        panel.appendChild(titleDiv);

      // Add version indicator
      const versionIndicator = document.createElement('div');
      versionIndicator.style.cssText = `
          color: #acb2b8;
          margin-bottom: 15px;
          padding: 5px 10px;
          background: rgba(49, 98, 130, 0.2);
          border-radius: 3px;
          text-align: center;
          font-size: 13px;
      `;
      versionIndicator.innerHTML = `Showing compatibility for RimWorld <strong>${sheet.version}</strong>`;
      panel.appendChild(versionIndicator);
      
        // Version selector
        const versionSelector = createVersionSelector(modInfo, selectedGid);
        panel.appendChild(versionSelector);

        // Add version note if it exists
        if (sheet.note) {
            const noteDiv = document.createElement('div');
            noteDiv.style.cssText = `
                color: #ffd700;
                font-style: italic;
                margin-bottom: 10px;
                font-size: 12px;
            `;
            noteDiv.textContent = sheet.note;
            panel.appendChild(noteDiv);
        }

        // Content
        const contentDiv = document.createElement('div');
        const statusColors = {
            'untested': '#ffd700',
            '1': '#ff4444',
            '2': '#ff8c1a',
            '3': '#ffeb3b',
            '4': '#4caf50'
        };

        const status = modInfo.status === '0' ? 'untested' : modInfo.status;
        const statusColor = statusColors[status] || '#acb2b8';
        const statusDescription = STATUS_DESCRIPTIONS[status] || 'Unknown status';

        // Status container with tooltip
        const statusContainer = document.createElement('div');
        statusContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 5px;
            position: relative;
            margin-bottom: 10px;
        `;

        statusContainer.innerHTML = `
            <strong>Status:</strong>
            <span style="color: ${statusColor}">${STATUS_DESCRIPTIONS[status].split(' - ')[0]}</span>
            <div class="status-tooltip" style="
                position: relative;
                display: inline-block;
                cursor: help;
            ">
                <span style="font-size: 14px;">ℹ️</span>
                <div class="tooltip-text" style="
                    visibility: hidden;
                    position: absolute;
                    z-index: 1000;
                    background-color: #1b2838;
                    color: #acb2b8;
                    text-align: left;
                    padding: 8px 12px;
                    border-radius: 6px;
                    border: 1px solid #4c6b22;
                    width: 250px;
                    bottom: 125%;
                    left: 50%;
                    transform: translateX(-50%);
                    font-size: 12px;
                    line-height: 1.4;
                    transition: opacity 0.2s;
                    opacity: 0;
                    pointer-events: none;
                    white-space: normal;
                ">${statusDescription}</div>
            </div>
        `;

        const tooltip = statusContainer.querySelector('.status-tooltip');
        const tooltipText = tooltip.querySelector('.tooltip-text');

        tooltip.addEventListener('mouseenter', () => {
            tooltipText.style.visibility = 'visible';
            tooltipText.style.opacity = '1';
        });

        tooltip.addEventListener('mouseleave', () => {
            tooltipText.style.visibility = 'hidden';
            tooltipText.style.opacity = '0';
        });

        contentDiv.appendChild(statusContainer);
        contentDiv.innerHTML += `<strong>Notes:</strong> ${modInfo.notes || 'No notes available'}<br>`;
        panel.appendChild(contentDiv);

        // Cache info and refresh section
        const cacheSection = document.createElement('div');
        cacheSection.style.cssText = `
            margin-top: 15px;
            padding-top: 10px;
            border-top: 1px solid #4c6b22;
            font-size: 11px;
            color: #7a8b9d;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

        const lastUpdated = document.createElement('div');
        lastUpdated.textContent = `Last updated: ${compatibilityCache.getLastUpdated()}`;

        const refreshButton = document.createElement('button');
        refreshButton.style.cssText = `
            background: #316282;
            color: #acb2b8;
            border: 1px solid #4c6b22;
            padding: 3px 8px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 5px;
        `;
        refreshButton.innerHTML = '🔄 Refresh Data';

        refreshButton.addEventListener('click', async () => {
            try {
                refreshButton.disabled = true;
                refreshButton.textContent = 'Refreshing...';
                await compatibilityCache.refreshCache();

                const modId = getModId();
                const newModInfo = compatibilityCache.getModInfo(modId, selectedGid);
                const newPanel = createInfoPanel(newModInfo, sheet, selectedGid);
                panel.replaceWith(newPanel);

                showToast('Compatibility data updated successfully!');
            } catch (error) {
                showToast('Failed to update compatibility data. Please try again later.', true);
                refreshButton.disabled = false;
                refreshButton.innerHTML = '🔄 Refresh Data';
            }
        });

        cacheSection.appendChild(lastUpdated);
        cacheSection.appendChild(refreshButton);
        panel.appendChild(cacheSection);

        return panel;
    }

    function createVersionSelector(currentModInfo, selectedGid) {
        const container = document.createElement('div');
        container.style.cssText = `
            margin: 10px 0;
            display: flex;
            align-items: center;
            gap: 10px;
        `;

        const label = document.createElement('label');
        label.textContent = 'RimWorld Version:';
        label.style.color = '#acb2b8';

        const select = document.createElement('select');
        select.style.cssText = `
            background: #316282;
            color: #acb2b8;
            border: 1px solid #4c6b22;
            padding: 5px;
            border-radius: 3px;
            cursor: pointer;
        `;

        SHEETS.forEach(sheet => {
            const option = document.createElement('option');
            option.value = sheet.gid;
            option.textContent = sheet.version;
            if (sheet.gid === selectedGid) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        // Buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = `
            display: flex;
            gap: 5px;
        `;

        // Set Default button
        const defaultButton = document.createElement('button');
        defaultButton.innerHTML = '📌';
        defaultButton.title = 'Set as default version';
        defaultButton.style.cssText = `
            background: #316282;
            color: #acb2b8;
            border: 1px solid #4c6b22;
            padding: 5px 10px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        `;
        defaultButton.addEventListener('click', () => {
            setDefaultVersion(select.value);
        });

        // Clear Default button
        const clearButton = document.createElement('button');
        clearButton.innerHTML = '❌';
        clearButton.title = 'Clear default version';
        clearButton.style.cssText = `
            background: #316282;
            color: #acb2b8;
            border: 1px solid #4c6b22;
            padding: 5px 10px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        `;
        clearButton.addEventListener('click', () => {
            GM_setValue('defaultVersion', null);
            showToast('Default version cleared');
        });

        select.addEventListener('change', (e) => {
            const modId = getModId();
            const selectedSheet = SHEETS.find(s => s.gid === e.target.value);
            if (!selectedSheet) return;

            const modInfo = compatibilityCache.getModInfo(modId, selectedSheet.gid);
            const newPanel = createInfoPanel(modInfo, selectedSheet, e.target.value);
            currentInfoPanel.replaceWith(newPanel);
            currentInfoPanel = newPanel;
        });

        container.appendChild(label);
        container.appendChild(select);
        buttonsContainer.appendChild(defaultButton);
        buttonsContainer.appendChild(clearButton);
        container.appendChild(buttonsContainer);

        return container;
    }

    async function initModPage() {
        
        if (!isRimworldModPage()) {
            return;
        }
        const modId = getModId();

        if (!modId) {
            return;
        }
        
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait time

        while (!compatibilityCache.initialized && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (!compatibilityCache.initialized) {
            createErrorPanel('Failed to initialize compatibility data. Please try refreshing the page.');
            return;
        }

        try {
            const detectedVersion = detectModVersion();
            const modInfo = compatibilityCache.getModInfo(modId, detectedVersion);
            const sheet = SHEETS.find(s => s.gid === detectedVersion);
            const panel = createInfoPanel(modInfo, sheet, detectedVersion);
            const descriptionElement = document.querySelector('.workshopItemDescription');
            if (descriptionElement) {
                if (currentInfoPanel) {
                    currentInfoPanel.replaceWith(panel);
                } else {
                    descriptionElement.parentElement.insertBefore(panel, descriptionElement);
                }
                currentInfoPanel = panel;
            } else {
                
            }
        } catch (error) {
            
            createErrorPanel('Failed to load compatibility information. Please try refreshing the page.');
        }
    }

    // Start the script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModPage);
    } else {
        initModPage();
    }

})();
