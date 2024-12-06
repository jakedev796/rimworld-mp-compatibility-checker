// ==UserScript==
// @name         Rimworld Workshop Mod Compatibility Checker
// @namespace    http://violentmonkey.github.io/
// @version      0.3
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

    const CONSTANTS = {
        SPREADSHEET: {
            ID: '1jaDxV8F7bcz4E9zeIRmZGKuaX7d0kvWWq28aKckISaY',
            SHEETS: [
                { version: '1.4/1.5', gid: '1144921800', note: 'Note: This list includes both 1.4 and 1.5 mods' },
                { version: '1.3', gid: '278315082' },
                { version: '1.1/1.2', gid: '149201791' },
                { version: '1.0', gid: '0' }
            ]
        },
        CACHE: {
            KEY: 'rimworld_mp_compatibility_data',
            TIMESTAMP_KEY: 'rimworld_mp_compatibility_timestamp',
            DURATION: 24 * 60 * 60 * 1000,
            REFRESH_ATTEMPTS: 50,
            REFRESH_INTERVAL: 100
        },
        STATUS: {
            DESCRIPTIONS: {
                'untested': 'Untested - Compatibility with multiplayer has not been verified',
                '1': 'Does not work - The mod is not compatible with multiplayer',
                '2': 'Major issues - The mod works but has significant features that do not function in multiplayer',
                '3': 'Minor issues - The mod works with some minor features not functioning in multiplayer',
                '4': 'Fully compatible - All features work correctly in multiplayer'
            },
            COLORS: {
                'untested': '#ffd700',
                '1': '#ff4444',
                '2': '#ff8c1a',
                '3': '#ffeb3b',
                '4': '#4caf50'
            },
            ICONS: {
                'untested': '❓',
                '1': '❌',
                '2': '⚡',
                '3': '⚠️',
                '4': '✅'
            }
        },
        UI: {
            COLORS: {
                BORDER: '#4c6b22',
                BACKGROUND: '#1b2838',
                TEXT: '#acb2b8',
                TEXT_HIGHLIGHT: '#ffffff',
                LINK: '#67c1f5'
            },
            SPACING: {
                SMALL: '5px',
                MEDIUM: '10px',
                LARGE: '15px'
            },
            TOAST_DURATION: 3000,
            COMMON_STYLES: {
                button: `
                    background: #316282;
                    color: #acb2b8;
                    border: 1px solid #4c6b22;
                    padding: 5px 10px;
                    border-radius: 3px;
                    cursor: pointer;
                `,
                panel: `
                    background-color: #1b2838;
                    border: 1px solid #4c6b22;
                    border-radius: 3px;
                    padding: 10px;
                    margin: 10px 0;
                    color: #acb2b8;
                    font-size: 14px;
                `
            }
        },
        MESSAGES: {
            TOAST: {
                DEFAULT_SET: (version) => `Default version set to ${version}`,
                DEFAULT_CLEARED: 'Default version cleared',
                UPDATE_SUCCESS: 'Compatibility data updated successfully!',
                UPDATE_ERROR: 'Failed to update compatibility data. Please try again later.'
            },
            ERROR: {
                CACHE_INIT: 'Failed to initialize compatibility data. Please try refreshing the page.',
                CACHE_UPDATE: 'Failed to update compatibility data. Please try again later.',
                CACHE_WORKSHOP: 'Failed to initialize cache for workshop icons'
            }
        }
    };

    let currentInfoPanel = null;

    // Utility functions for page type checking
    function isRimworldModPage() {
        const isWorkshopUrl = window.location.href.includes('/sharedfiles/filedetails/');
        const hasRimWorldHeader = document.querySelector('.apphub_AppName')?.textContent.includes('RimWorld');
        const isCollection = document.querySelector('.collectionItem, .collectionHeader') !== null;
        return isWorkshopUrl && hasRimWorldHeader && !isCollection;
    }

    function isRimworldCollectionPage() {
        const isCollectionUrl = window.location.href.includes('/sharedfiles/filedetails/');
        const hasRimWorldHeader = document.querySelector('.apphub_AppName')?.textContent.includes('RimWorld');
        const hasCollectionItems = document.querySelector('.collectionItem') !== null;
        const isCollectionHeader = document.querySelector('.collectionHeader') !== null;
        return isCollectionUrl && hasRimWorldHeader && (hasCollectionItems || isCollectionHeader);
    }

    function isRimworldWorkshopPage() {
        const isWorkshopBrowse = window.location.href.includes('/workshop/browse');
        const hasRimWorldHeader = document.querySelector('.apphub_AppName')?.textContent.includes('RimWorld');
        return isWorkshopBrowse && hasRimWorldHeader;
    }

    function getModId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
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
        }, CONSTANTS.UI.TOAST_DURATION);
    }
    /**
     * Manages compatibility data caching and updates.
     * Handles data fetching, parsing, and storage for mod compatibility information.
     */
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
                const cachedData = localStorage.getItem(CONSTANTS.CACHE.KEY);
                const cachedTimestamp = localStorage.getItem(CONSTANTS.CACHE.TIMESTAMP_KEY);

                if (cachedData && cachedTimestamp) {
                    this.data = JSON.parse(cachedData);
                    this.timestamp = parseInt(cachedTimestamp);
                    this.initialized = true;

                    if (this.isExpired()) {
                        await this.refreshCache();
                    }
                } else {
                    await this.refreshCache();
                }
            } catch (error) {
                console.error('Cache initialization failed:', error);
                this.updateStatusIndicator('error');
                this.initialized = true;
            } finally {
                this.isLoading = false;
            }
        }

        isExpired() {
            return !this.timestamp || (Date.now() - this.timestamp > CONSTANTS.CACHE.DURATION);
        }

        async refreshCache() {
            if (this.isLoading && this.initialized) return;

            this.isLoading = true;
            this.updateStatusIndicator('loading');

            try {
                const allData = {};
                for (const sheet of CONSTANTS.SPREADSHEET.SHEETS) {
                    const url = `https://docs.google.com/spreadsheets/d/${CONSTANTS.SPREADSHEET.ID}/export?format=csv&gid=${sheet.gid}`;
                    const response = await this.fetchSheet(url);
                    allData[sheet.gid] = this.parseCSV(response);
                }

                this.data = allData;
                this.timestamp = Date.now();
                this.initialized = true;

                localStorage.setItem(CONSTANTS.CACHE.KEY, JSON.stringify(this.data));
                localStorage.setItem(CONSTANTS.CACHE.TIMESTAMP_KEY, this.timestamp.toString());

                this.updateStatusIndicator('success');
            } catch (error) {
                console.error('Cache refresh failed:', error);
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
                        showToast(CONSTANTS.MESSAGES.TOAST.UPDATE_SUCCESS);
                    } catch (error) {
                        showToast(CONSTANTS.MESSAGES.TOAST.UPDATE_ERROR, true);
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
                            reject(new Error(`Failed to fetch data (Status: ${response.status})`));
                        }
                    },
                    onerror: (error) => reject(new Error(`Request failed: ${error}`))
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
    /**
     * Helper functions for version management
     */
    function getDefaultVersion() {
        return GM_getValue('defaultVersion', null);
    }

    function setDefaultVersion(version) {
        if (version === null) {
            GM_setValue('defaultVersion', null);
            showToast(CONSTANTS.MESSAGES.TOAST.DEFAULT_CLEARED);
        } else {
            GM_setValue('defaultVersion', version);
            const versionName = CONSTANTS.SPREADSHEET.SHEETS.find(s => s.gid === version)?.version || 'Unknown';
            showToast(CONSTANTS.MESSAGES.TOAST.DEFAULT_SET(versionName));
        }

        document.dispatchEvent(new Event('defaultVersionChanged'));
    }

    function detectModVersion() {
        const defaultVersion = getDefaultVersion();
        if (defaultVersion) return defaultVersion;

        const detailsBlock = document.querySelector('.rightDetailsBlock');
        if (detailsBlock) {
            const versionLinks = Array.from(detailsBlock.getElementsByTagName('a'))
                .filter(a => a.textContent.match(/^1\.[0-5]$/))
                .map(a => a.textContent);

            if (versionLinks.length > 0) {
                const versions = versionLinks.sort((a, b) => parseFloat(b) - parseFloat(a));
                const highestVersion = versions[0];

                if (highestVersion >= '1.4') return CONSTANTS.SPREADSHEET.SHEETS[0].gid;
                if (highestVersion === '1.3') return CONSTANTS.SPREADSHEET.SHEETS[1].gid;
                if (highestVersion === '1.2' || highestVersion === '1.1') return CONSTANTS.SPREADSHEET.SHEETS[2].gid;
                if (highestVersion === '1.0') return CONSTANTS.SPREADSHEET.SHEETS[3].gid;
            }
        }

        return CONSTANTS.SPREADSHEET.SHEETS[0].gid;
    }

    function createTooltip(modInfo, defaultGid) {
        const tooltip = document.createElement('div');
        tooltip.className = 'mp-compat-tooltip';

        const updateTooltipContent = () => {
            const activeSheet = CONSTANTS.SPREADSHEET.SHEETS.find(s => s.gid === defaultGid) || CONSTANTS.SPREADSHEET.SHEETS[0];
            const status = modInfo.status === '0' ? 'untested' : modInfo.status;

            const versionInfo = defaultGid
                ? `<div class="mp-compat-version">RimWorld ${activeSheet.version} (default)</div>`
                : `<div class="mp-compat-version">RimWorld ${activeSheet.version}</div>`;

            tooltip.innerHTML = `
            ${versionInfo}
            <strong>${CONSTANTS.STATUS.DESCRIPTIONS[status]}</strong>
            <div class="mp-compat-tooltip-notes">${modInfo.notes}</div>
        `;
        };

        updateTooltipContent();

        document.addEventListener('defaultVersionChanged', () => {
            const newDefaultGid = getDefaultVersion() || CONSTANTS.SPREADSHEET.SHEETS[0].gid;
            if (newDefaultGid !== defaultGid) {
                defaultGid = newDefaultGid;
                updateTooltipContent();
            }
        });

        return tooltip;
    }

    function createVersionSelectorBar(selectedGid) {
        const container = document.createElement('div');
        container.style.cssText = `
        background-color: ${CONSTANTS.UI.COLORS.BACKGROUND};
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: ${CONSTANTS.UI.COLORS.BORDER};
        padding: ${CONSTANTS.UI.SPACING.MEDIUM};
        display: flex;
        align-items: center;
        justify-content: center;
        gap: ${CONSTANTS.UI.SPACING.MEDIUM};
        font-size: 14px;
        color: ${CONSTANTS.UI.COLORS.TEXT};
    `;

        const label = document.createElement('label');
        label.textContent = 'RimWorld Version:';

        const select = document.createElement('select');
        select.style.cssText = CONSTANTS.UI.COMMON_STYLES.button;

        CONSTANTS.SPREADSHEET.SHEETS.forEach(sheet => {
            const option = document.createElement('option');
            option.value = sheet.gid;
            option.textContent = sheet.version;
            if (sheet.gid === selectedGid) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        const setDefaultButton = document.createElement('button');
        setDefaultButton.innerHTML = '📌 Set as Default';
        setDefaultButton.style.cssText = CONSTANTS.UI.COMMON_STYLES.button;
        setDefaultButton.addEventListener('click', () => setDefaultVersion(select.value));

        const clearDefaultButton = document.createElement('button');
        clearDefaultButton.innerHTML = '❌ Clear Default';
        clearDefaultButton.style.cssText = CONSTANTS.UI.COMMON_STYLES.button;
        clearDefaultButton.addEventListener('click', () => setDefaultVersion(null));

        select.addEventListener('change', async (e) => {
            await updateAllContent(e.target.value);
        });

        container.appendChild(label);
        container.appendChild(select);
        container.appendChild(setDefaultButton);
        container.appendChild(clearDefaultButton);

        return container;
    }

    function createInfoPanel(modInfo, sheet = CONSTANTS.SPREADSHEET.SHEETS[0], selectedGid = CONSTANTS.SPREADSHEET.SHEETS[0].gid) {
        const panel = document.createElement('div');
        panel.style.cssText = CONSTANTS.UI.COMMON_STYLES.panel;

        // Title
        const titleDiv = document.createElement('div');
        titleDiv.style.cssText = `
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 15px;
            color: ${CONSTANTS.UI.COLORS.TEXT_HIGHLIGHT};
            text-align: center;
            border-bottom-width: 1px;
            border-bottom-style: solid;
            border-bottom-color: ${CONSTANTS.UI.COLORS.BORDER};
            padding-bottom: 10px;
        `;
        titleDiv.textContent = 'RimWorld Multiplayer Compatibility';
        panel.appendChild(titleDiv);

        // Version indicator
        const versionIndicator = document.createElement('div');
        versionIndicator.style.cssText = `
            color: ${CONSTANTS.UI.COLORS.TEXT};
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
        const versionSelector = createVersionSelectorBar(selectedGid);
        panel.appendChild(versionSelector);

        // Version note if exists
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
        const status = modInfo.status === '0' ? 'untested' : modInfo.status;
        const statusColor = CONSTANTS.STATUS.COLORS[status] || CONSTANTS.UI.COLORS.TEXT;
        const statusDescription = CONSTANTS.STATUS.DESCRIPTIONS[status] || 'Unknown status';

        // Status container
        const statusContainer = document.createElement('div');
        statusContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 5px;
            margin-bottom: 10px;
        `;

        // Spreadsheet link
        const spreadsheetLink = document.createElement('div');
        spreadsheetLink.style.cssText = `
            margin-top: 10px;
            margin-bottom: 10px;
        `;

        let rowNumber = null;
        const modId = getModId();

        // Manual offset for sheets
        const manualOffsetByGid = {
            '1144921800': -4,
            '278315082': -4,
            '149201791': -5,
            '0': -5
        };

        if (compatibilityCache.data && compatibilityCache.data[selectedGid]) {
            const sheetData = compatibilityCache.data[selectedGid];
            const STEAM_ID_COL = 2;

            for (let i = 0; i < sheetData.length; i++) {
                if (sheetData[i][STEAM_ID_COL] === modId) {
                    const manualOffset = manualOffsetByGid[selectedGid] || 0;
                    rowNumber = i + 1 + manualOffset;
                    break;
                }
            }
        }

        if (rowNumber !== null) {
            const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${CONSTANTS.SPREADSHEET.ID}/edit?gid=${selectedGid}&range=C${rowNumber}`;
            spreadsheetLink.innerHTML = `
                <a href="${spreadsheetUrl}" target="_blank" style="color: ${CONSTANTS.UI.COLORS.LINK};">
                    View in Compatibility Spreadsheet
                </a>
            `;
            contentDiv.appendChild(spreadsheetLink);
        }

        const statusIndicator = document.createElement('span');
        statusIndicator.style.color = statusColor;
        statusIndicator.textContent = `Status: ${statusDescription}`;

        statusContainer.appendChild(statusIndicator);
        contentDiv.appendChild(statusContainer);
        contentDiv.innerHTML += `<strong>Notes:</strong> ${modInfo.notes || 'No notes available'}<br>`;
        panel.appendChild(contentDiv);

        // Cache info and refresh section
        const cacheSection = document.createElement('div');
        cacheSection.style.cssText = `
            margin-top: 15px;
            padding-top: 10px;
            border-top: 1px solid ${CONSTANTS.UI.COLORS.BORDER};
            font-size: 11px;
            color: #7a8b9d;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

        const lastUpdated = document.createElement('div');
        lastUpdated.textContent = `Last updated: ${compatibilityCache.getLastUpdated()}`;

        const refreshButton = document.createElement('button');
        refreshButton.style.cssText = CONSTANTS.UI.COMMON_STYLES.button + 'font-size: 11px;';
        refreshButton.innerHTML = '🔄 Refresh Data';

        refreshButton.addEventListener('click', async () => {
            try {
                refreshButton.disabled = true;
                refreshButton.textContent = 'Refreshing...';
                await compatibilityCache.refreshCache();

                const modId = getModId();
                const allSheets = CONSTANTS.SPREADSHEET.SHEETS;
                const currentSheet = allSheets.find(s => s.gid === selectedGid) || allSheets[0];
                const newModInfo = compatibilityCache.getModInfo(modId, selectedGid);

                const newPanel = createInfoPanel(newModInfo, currentSheet, selectedGid);

                const versionSelect = newPanel.querySelector('select');
                if (versionSelect) {
                    versionSelect.value = selectedGid;
                }

                const versionIndicator = newPanel.querySelector('div:nth-child(2)');
                if (versionIndicator) {
                    versionIndicator.innerHTML = `Showing compatibility for RimWorld <strong>${currentSheet.version}</strong>`;
                }

                panel.replaceWith(newPanel);
                currentInfoPanel = newPanel;

                showToast(CONSTANTS.MESSAGES.TOAST.UPDATE_SUCCESS);
            } catch (error) {
                console.error('Failed to refresh data:', error);
                showToast(CONSTANTS.MESSAGES.TOAST.UPDATE_ERROR, true);
            } finally {
                refreshButton.disabled = false;
                refreshButton.innerHTML = '🔄 Refresh Data';
            }
        });

        cacheSection.appendChild(lastUpdated);
        cacheSection.appendChild(refreshButton);
        panel.appendChild(cacheSection);

        return panel;
    }

    function createErrorPanel(errorMessage) {
        const panel = document.createElement('div');
        panel.style.cssText = CONSTANTS.UI.COMMON_STYLES.panel + `
        border-color: #ff4444;
        color: #ff4444;
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

    async function addVersionSelectorToPages() {
        if (!isRimworldWorkshopPage() && !isRimworldCollectionPage()) return;

        let attempts = 0;
        while (!compatibilityCache.initialized && attempts < CONSTANTS.CACHE.REFRESH_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, CONSTANTS.CACHE.REFRESH_INTERVAL));
            attempts++;
        }

        if (!compatibilityCache.initialized) {
            console.error(CONSTANTS.MESSAGES.ERROR.CACHE_WORKSHOP);
            return;
        }

        const defaultGid = getDefaultVersion() || CONSTANTS.SPREADSHEET.SHEETS[0].gid;
        const versionSelectorBar = createVersionSelectorBar(defaultGid);

        if (isRimworldWorkshopPage()) {
            const searchedTermsContainer = document.querySelector('.searchedTermsContainer');
            if (searchedTermsContainer) {
                versionSelectorBar.style.marginBottom = '20px';
                if (searchedTermsContainer.querySelector('.workshop_browsing')) {
                    searchedTermsContainer.querySelector('.workshop_browsing').style.marginTop = '10px';
                }
                searchedTermsContainer.parentElement.insertBefore(versionSelectorBar, searchedTermsContainer);
            }
        } else if (isRimworldCollectionPage()) {
            const collectionHeader = document.querySelector('.collectionHeader');
            if (collectionHeader) {
                collectionHeader.parentElement.insertBefore(versionSelectorBar, collectionHeader);
            }
        }
    }
    async function addWorkshopIcons() {
        if (!isRimworldWorkshopPage() && !isRimworldCollectionPage()) return;

        let attempts = 0;
        while (!compatibilityCache.initialized && attempts < CONSTANTS.CACHE.REFRESH_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, CONSTANTS.CACHE.REFRESH_INTERVAL));
            attempts++;
        }

        if (!compatibilityCache.initialized) {
            console.error(CONSTANTS.MESSAGES.ERROR.CACHE_WORKSHOP);
            return;
        }

        const style = document.createElement('style');
        style.textContent = `
        .mp-compat-icon {
            position: absolute;
            top: 5px;
            right: 5px;
            background: rgba(0, 0, 0, 0.8);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 16px;
            z-index: 10;
            cursor: help;
            pointer-events: all;
        }
        .mp-compat-tooltip {
            display: none;
            position: fixed;
            background: ${CONSTANTS.UI.COLORS.BACKGROUND};
            color: ${CONSTANTS.UI.COLORS.TEXT};
            padding: 15px 20px;
            border-radius: 3px;
            font-size: 13px;
            z-index: 1001;
            min-width: 250px;
            max-width: 400px;
            white-space: normal;
            margin-top: 8px;
            border-width: 1px;
            border-style: solid;
            border-color: ${CONSTANTS.UI.COLORS.BORDER};
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
            pointer-events: all;
        }
        .mp-compat-tooltip strong {
            color: ${CONSTANTS.UI.COLORS.TEXT_HIGHLIGHT};
            display: block;
            margin-bottom: 8px;
            font-size: 14px;
            line-height: 1.4;
        }
        .mp-compat-tooltip-notes {
            max-height: 200px;
            overflow-y: auto;
            padding-right: 10px;
            line-height: 1.5;
        }
        .mp-compat-tooltip-notes::-webkit-scrollbar {
            width: 6px;
        }
        .mp-compat-tooltip-notes::-webkit-scrollbar-track {
            background: #2a475e;
        }
        .mp-compat-tooltip-notes::-webkit-scrollbar-thumb {
            background: ${CONSTANTS.UI.COLORS.LINK};
        }
        .workshopItem.tooltip-hover {
            pointer-events: none !important;
        }
        .mp-compat-version {
            color: ${CONSTANTS.UI.COLORS.LINK};
            font-size: 11px;
            margin-bottom: 5px;
            opacity: 0.8;
        }
    `;

        document.head.appendChild(style);

        const processWorkshopItems = () => {
            const items = document.querySelectorAll('.workshopItem, .collectionItem');
            items.forEach(item => {
                if (item.querySelector('.mp-compat-icon')) return;

                const linkElement = item.querySelector('a[href*="filedetails"]');
                if (!linkElement) return;

                const modId = new URLSearchParams(linkElement.href.split('?')[1]).get('id');
                if (!modId) return;

                const defaultGid = getDefaultVersion() || CONSTANTS.SPREADSHEET.SHEETS[0].gid;
                const modInfo = compatibilityCache.getModInfo(modId, defaultGid);
                const status = modInfo.status === '0' ? 'untested' : modInfo.status;

                const iconContainer = document.createElement('div');
                iconContainer.className = 'mp-compat-icon';
                iconContainer.style.color = CONSTANTS.STATUS.COLORS[status];
                iconContainer.textContent = CONSTANTS.STATUS.ICONS[status];

                const tooltip = createTooltip(modInfo, defaultGid);
                document.body.appendChild(tooltip);

                const checkPosition = () => {
                    const rect = iconContainer.getBoundingClientRect();
                    const windowWidth = window.innerWidth;
                    tooltip.style.left = rect.left < windowWidth / 2 ? `${rect.left - 10}px` : 'auto';
                    tooltip.style.right = rect.left >= windowWidth / 2 ? `${window.innerWidth - rect.right - 10}px` : 'auto';
                    tooltip.style.top = `${rect.bottom + 8}px`;
                };

                iconContainer.addEventListener('mouseenter', () => {
                    tooltip.style.display = 'block';
                    checkPosition();
                });

                const hideTooltip = (e) => {
                    if (!tooltip.contains(e.relatedTarget) && !iconContainer.contains(e.relatedTarget)) {
                        tooltip.style.display = 'none';
                    }
                };

                iconContainer.addEventListener('mouseleave', hideTooltip);
                tooltip.addEventListener('mouseleave', hideTooltip);

                ['click', 'mousedown', 'mouseup'].forEach(eventType => {
                    [iconContainer, tooltip].forEach(element => {
                        element.addEventListener(eventType, (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                        });
                    });
                });

                const imageContainer = item.querySelector('.workshopItemPreviewHolder');
                if (imageContainer) {
                    imageContainer.style.position = 'relative';
                    imageContainer.appendChild(iconContainer);
                    window.addEventListener('scroll', checkPosition);
                    window.addEventListener('resize', checkPosition);
                }
            });
        };

        processWorkshopItems();

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    processWorkshopItems();
                }
            });
        });

        const container = document.querySelector('.workshopBrowseItems, .collectionItemsContainer');
        if (container) {
            observer.observe(container, { childList: true, subtree: true });
        }
    }

    async function updateWorkshopIcons(selectedGid) {
        const items = document.querySelectorAll('.workshopItem, .collectionItem');
        items.forEach(item => {
            const linkElement = item.querySelector('a[href*="filedetails"]');
            if (!linkElement) return;

            const modId = new URLSearchParams(linkElement.href.split('?')[1]).get('id');
            if (!modId) return;

            const modInfo = compatibilityCache.getModInfo(modId, selectedGid);
            const status = modInfo.status === '0' ? 'untested' : modInfo.status;

            const iconContainer = item.querySelector('.mp-compat-icon');
            if (iconContainer) {
                iconContainer.style.color = CONSTANTS.STATUS.COLORS[status];
                iconContainer.textContent = CONSTANTS.STATUS.ICONS[status];
            }

            const tooltip = document.querySelector(`.mp-compat-tooltip[data-mod-id="${modId}"]`);
            if (tooltip) {
                const activeSheet = CONSTANTS.SPREADSHEET.SHEETS.find(s => s.gid === selectedGid) || CONSTANTS.SPREADSHEET.SHEETS[0];
                const versionInfo = selectedGid
                    ? `<div class="mp-compat-version">RimWorld ${activeSheet.version} (default)</div>`
                    : `<div class="mp-compat-version">RimWorld ${activeSheet.version}</div>`;

                tooltip.querySelector('.mp-compat-version').outerHTML = versionInfo;
                tooltip.querySelector('strong').textContent = CONSTANTS.STATUS.DESCRIPTIONS[status];
                tooltip.querySelector('.mp-compat-tooltip-notes').textContent = modInfo.notes;
            }
        });
    }

    async function createCollectionSummary(selectedGid = getDefaultVersion() || CONSTANTS.SPREADSHEET.SHEETS[0].gid) {
        const existingSummaries = document.querySelectorAll('.compatibility-summary-panel');
        existingSummaries.forEach(summary => summary.remove());

        const defaultSheet = CONSTANTS.SPREADSHEET.SHEETS.find(s => s.gid === selectedGid) || CONSTANTS.SPREADSHEET.SHEETS[0];
        const items = await waitForCollectionItems();

        if (!items?.length) {
            console.log('No collection items found');
            return;
        }

        const summary = {
            'untested': 0,
            '1': 0,
            '2': 0,
            '3': 0,
            '4': 0
        };

        const modList = {
            'untested': [],
            '1': [],
            '2': [],
            '3': [],
            '4': []
        };

        items.forEach(item => {
            const linkElement = item.querySelector('a[href*="filedetails"]');
            if (!linkElement) return;

            const modId = new URLSearchParams(linkElement.href.split('?')[1]).get('id');
            if (!modId) return;

            const modInfo = compatibilityCache.getModInfo(modId, selectedGid);
            const status = modInfo.status === '0' ? 'untested' : modInfo.status;

            summary[status]++;
            modList[status].push({
                name: item.querySelector('.workshopItemTitle')?.textContent || 'Unknown',
                id: modId
            });
        });

        const panel = document.createElement('div');
        panel.className = 'compatibility-summary-panel';
        panel.style.cssText = CONSTANTS.UI.COMMON_STYLES.panel;

        panel.innerHTML = `
        <div style="font-size: 16px; font-weight: bold; margin-bottom: 15px; color: ${CONSTANTS.UI.COLORS.TEXT_HIGHLIGHT}; text-align: center; border-bottom-width: 1px; border-bottom-style: solid; border-bottom-color: ${CONSTANTS.UI.COLORS.BORDER}; padding-bottom: 10px;">
            Compatibility Summary for RimWorld ${defaultSheet.version}
        </div>
        ${Object.entries(summary).map(([status, count]) => `
            <div class="compat-summary-row" data-status="${status}" style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; cursor: pointer;">
                <div style="display: flex; align-items: center;">
                    <span style="color: ${CONSTANTS.STATUS.COLORS[status]}; margin-right: 8px;">${CONSTANTS.STATUS.ICONS[status]}</span>
                    <span>${CONSTANTS.STATUS.DESCRIPTIONS[status]}</span>
                </div>
                <div style="font-weight: bold;">${count}</div>
            </div>
            <div class="compat-detail-list" data-status="${status}" style="display: none; margin-left: 20px; margin-top: 5px; margin-bottom: 10px;">
                ${modList[status].map(mod => `
                    <div style="margin: 5px 0;">
                        <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.id}"
                           target="_blank"
                           style="color: ${CONSTANTS.UI.COLORS.LINK};">
                            ${mod.name}
                        </a>
                    </div>
                `).join('')}
            </div>
        `).join('')}
        ${defaultSheet.note ? `
            <div style="margin-top: 15px; color: #ffd700; font-style: italic; font-size: 12px;">
                ${defaultSheet.note}
            </div>
        ` : ''}
    `;

        panel.querySelectorAll('.compat-summary-row').forEach(row => {
            row.addEventListener('click', () => {
                const status = row.dataset.status;
                const list = panel.querySelector(`.compat-detail-list[data-status="${status}"]`);
                if (list) {
                    const wasHidden = list.style.display === 'none';
                    panel.querySelectorAll('.compat-detail-list').forEach(l => {
                        l.style.display = 'none';
                    });
                    if (wasHidden) {
                        list.style.display = 'block';
                    }
                }
            });
        });

        const itemsHeader = document.querySelector('.detailBox .workshopItemDescriptionTitle');
        if (itemsHeader?.parentElement) {
            const existingSummaries = itemsHeader.parentElement.querySelectorAll('.compatibility-summary-panel');
            existingSummaries.forEach(summary => summary.remove());
            itemsHeader.parentElement.insertBefore(panel, itemsHeader.nextSibling);
        }

        return panel;
    }

    async function waitForCollectionItems() {
        return new Promise((resolve) => {
            const checkForItems = () => {
                const collectionItems = document.querySelectorAll('.collectionItem');
                if (collectionItems.length > 0) {
                    resolve(Array.from(collectionItems));
                    return;
                }
                setTimeout(checkForItems, 100);
            };
            checkForItems();
        });
    }

    async function updateAllContent(selectedGid) {
        try {
            const existingSummaries = document.querySelectorAll('.compatibility-summary-panel');
            existingSummaries.forEach(summary => summary.remove());

            if (isRimworldModPage()) {
                const modId = getModId();
                const modInfo = compatibilityCache.getModInfo(modId, selectedGid);
                const sheet = CONSTANTS.SPREADSHEET.SHEETS.find(s => s.gid === selectedGid);
                const newPanel = createInfoPanel(modInfo, sheet, selectedGid);

                if (currentInfoPanel) {
                    currentInfoPanel.replaceWith(newPanel);
                } else {
                    const descriptionElement = document.querySelector('.workshopItemDescription');
                    if (descriptionElement) {
                        descriptionElement.parentElement.insertBefore(newPanel, descriptionElement);
                    }
                }
                currentInfoPanel = newPanel;
            }

            await updateWorkshopIcons(selectedGid);

            if (isRimworldCollectionPage()) {
                await new Promise(resolve => setTimeout(resolve, 100));
                await createCollectionSummary(selectedGid);
            }
        } catch (error) {
            console.error('Error updating content:', error);
            showToast(CONSTANTS.MESSAGES.TOAST.UPDATE_ERROR, true);
        }
    }

    async function initialize() {
        if (isRimworldWorkshopPage() || isRimworldCollectionPage()) {
            await addVersionSelectorToPages();
        }

        if (isRimworldModPage()) {
            await initModPage();
        } else if (isRimworldWorkshopPage() || isRimworldCollectionPage()) {
            await addWorkshopIcons();
            if (isRimworldCollectionPage()) {
                await createCollectionSummary();
            }
        }
    }

    async function initModPage() {
        if (!isRimworldModPage()) return;

        const modId = getModId();
        if (!modId) return;

        let attempts = 0;
        while (!compatibilityCache.initialized && attempts < CONSTANTS.CACHE.REFRESH_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, CONSTANTS.CACHE.REFRESH_INTERVAL));
            attempts++;
        }

        if (!compatibilityCache.initialized) {
            createErrorPanel(CONSTANTS.MESSAGES.ERROR.CACHE_INIT);
            return;
        }

        try {
            const detectedVersion = detectModVersion();
            const modInfo = compatibilityCache.getModInfo(modId, detectedVersion);
            const sheet = CONSTANTS.SPREADSHEET.SHEETS.find(s => s.gid === detectedVersion);
            const panel = createInfoPanel(modInfo, sheet, detectedVersion);

            const descriptionElement = document.querySelector('.workshopItemDescription');
            if (descriptionElement) {
                if (currentInfoPanel) {
                    currentInfoPanel.replaceWith(panel);
                } else {
                    descriptionElement.parentElement.insertBefore(panel, descriptionElement);
                }
                currentInfoPanel = panel;
            }
        } catch (error) {
            console.error('Failed to initialize mod page:', error);
            createErrorPanel(CONSTANTS.MESSAGES.ERROR.CACHE_INIT);
        }
    }

    const compatibilityCache = new CompatibilityCache();

// Initialize the script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();