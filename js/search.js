// Search Controller for Leasing Search App (v2: 그룹핑 카드 + 회전/Fit 모드)
// Firebase 연동 검색 및 UI 제어

class LeasingSearchApp {
    constructor() {
        this.currentResults = [];     // 원본 row 데이터
        this.currentGroups = [];      // 그룹핑된 카드 데이터
        this.currentSearchOptions = {}; // 최근 검색 옵션 (정렬용)
        this.selectedItems = new Map();
        this.currentPage = 1;
        this.pageSize = 20;           // 그룹(카드) 단위
        this.isLoading = false;
        this.currentDisplayPageNum = 1;
        this.currentViewItem = null;
        this.archiveList = [];
        this.maxPageSearchAttempts = 20;
        this.isSearchingPage = false;

        // 출처 색상
        this.sourceColorCache = new Map();
        this.colorPalette = [
            '#0d6efd','#198754','#dc3545','#fd7e14','#6f42c1',
            '#20c997','#e83e8c','#005a2b','#6610f2','#d63384',
            '#0dcaf0','#ffc107','#6c757d','#0a58ca','#ab2e3c',
            '#087990','#aa6e2e','#5c636a','#3d8bfd','#479f76'
        ];

        // 이미지 줌/회전/Fit 상태
        this._zoom = {
            scale: 1, lastScale: 1, startDist: 0, lastTapTime: 0,
            isFullscreen: false,
            rotation: 0,           // 0, 90, 180, 270
            fitMode: 'width'       // 'width' | 'all'
        };

        this.init();
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    getSourceColor(source) {
        if (!source) return this.colorPalette[0];
        if (this.sourceColorCache.has(source)) return this.sourceColorCache.get(source);
        const color = this.colorPalette[this.hashString(source) % this.colorPalette.length];
        this.sourceColorCache.set(source, color);
        return color;
    }

    renderSourceBadge(source) {
        const color = this.getSourceColor(source);
        return `<span class="source-badge" style="background-color:${color};">${this.escapeHtml(source)}</span>`;
    }

    async init() {
        console.log('🚀 Initializing Leasing Search App v2 (Grouped Cards)...');
        this.bindEvents();
        this.setupAutocomplete();
        try {
            this.showLoading('데이터를 초기화하는 중...');
            await FirebaseService.loadMergedData();
            const lastUpdate = await FirebaseService.getLastUpdateTime();
            document.getElementById('lastUpdated').textContent = `최신 자료: ${lastUpdate}`;
            this.hideLoading();
        } catch (error) {
            console.error('❌ Initialization error:', error);
            this.hideLoading();
            this.showError('데이터 로드 중 오류가 발생했습니다.');
        }
    }

    bindEvents() {
        document.getElementById('searchType').addEventListener('change', (e) => {
            this.onSearchTypeChange(e.target.value);
        });

        document.getElementById('searchBtn').addEventListener('click', () => {
            document.querySelectorAll('.suggestions').forEach(s => s.classList.remove('show'));
            this.performSearch();
        });

        document.getElementById('resetBtn').addEventListener('click', () => this.resetSearch());
        document.getElementById('loadAllBtn').addEventListener('click', () => this.loadAll());

        document.getElementById('pageSize').addEventListener('change', (e) => {
            this.pageSize = parseInt(e.target.value);
            this.currentPage = 1;
            this.renderResults();
        });

        ['buildingName','districtName','stationName','walkingTime','vacancyAreaFrom','vacancyAreaTo'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        document.querySelectorAll('.suggestions').forEach(s => s.classList.remove('show'));
                        this.performSearch();
                    }
                });
            }
        });

        document.getElementById('showSelectedMap').addEventListener('click', () => this.showSelectedOnMap());

        document.getElementById('prevPageBtn').addEventListener('click', () => this.showPrevPage());
        document.getElementById('nextPageBtn').addEventListener('click', () => this.showNextPage());

        document.getElementById('archiveSelect').addEventListener('change', (e) => {
            this.onArchiveSelect(e.target.value);
        });

        const fullscreenBtn = document.getElementById('imageFullscreenBtn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => this.toggleImageFullscreen());
        }

        // ★ 새로 추가: 회전 버튼
        const rotateBtn = document.getElementById('imageRotateBtn');
        if (rotateBtn) {
            rotateBtn.addEventListener('click', () => this.toggleImageRotation());
        }

        // ★ 새로 추가: Fit 모드 토글
        const fitBtn = document.getElementById('imageFitBtn');
        if (fitBtn) {
            fitBtn.addEventListener('click', () => this.toggleFitMode());
        }

        // 키보드 단축키
        document.addEventListener('keydown', (e) => {
            const modal = document.getElementById('imageViewerModal');
            if (modal.classList.contains('show') && !this.isSearchingPage) {
                if (e.key === 'ArrowLeft') { e.preventDefault(); this.showPrevPage(); }
                else if (e.key === 'ArrowRight') { e.preventDefault(); this.showNextPage(); }
                else if (e.key === 'Escape') { this.exitImageFullscreen(); }
                else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); this.toggleImageRotation(); }
                else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); this.toggleFitMode(); }
            }
        });

        document.getElementById('imageViewerModal').addEventListener('hidden.bs.modal', () => {
            this.resetImageZoom();
            this.exitImageFullscreen();
            // 회전/Fit도 모달 닫힐 때 초기화
            this._zoom.rotation = 0;
            this._zoom.fitMode = 'width';
        });
    }

    onSearchTypeChange(type) {
        document.querySelectorAll('.search-input').forEach(el => el.classList.add('d-none'));
        const searchIds = {
            'building':'buildingSearch','district':'districtSearch',
            'station':'stationSearch','area':'areaSearch','complex':'complexSearch'
        };
        const targetId = searchIds[type];
        if (targetId) document.getElementById(targetId).classList.remove('d-none');
        if (type === 'complex') {
            ['buildingSearch','districtSearch','stationSearch','areaSearch'].forEach(id => {
                document.getElementById(id).classList.remove('d-none');
            });
        }
    }

    setupAutocomplete() {
        this.setupAutocompleteField('buildingName', 'buildingSuggestions', async (query) => {
            const suggestions = await FirebaseService.getBuildingNameSuggestions(query);
            return suggestions.map(s => ({ text: s.name, subtext: s.address, value: s.name }));
        });

        this.setupAutocompleteField('districtName', 'districtSuggestions', async (query) => {
            const suggestions = await FirebaseService.getDistrictSuggestions(query);
            return suggestions.map(s => ({ text: s, value: s }));
        });

        this.setupAutocompleteField('stationName', 'stationSuggestions', async (query) => {
            const suggestions = await FirebaseService.getStationSuggestions(query);
            return suggestions.map(s => ({ text: s, value: s }));
        });
    }

    setupAutocompleteField(inputId, suggestionsId, fetchFn) {
        const input = document.getElementById(inputId);
        const suggestions = document.getElementById(suggestionsId);
        if (!input || !suggestions) return;
        input.setAttribute('enterkeyhint', 'search');

        let debounceTimer = null;

        input.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            if (debounceTimer) clearTimeout(debounceTimer);
            document.querySelectorAll('.suggestions').forEach(s => {
                if (s.id !== suggestionsId) s.classList.remove('show');
            });
            if (query.length < 1) { suggestions.classList.remove('show'); return; }
            debounceTimer = setTimeout(async () => {
                try {
                    const items = await fetchFn(query);
                    this.renderSuggestions(suggestions, items, input, query);
                } catch (error) { console.error('Autocomplete error:', error); }
            }, 200);
        });

        input.addEventListener('focus', () => {
            document.querySelectorAll('.suggestions').forEach(s => {
                if (s.id !== suggestionsId) s.classList.remove('show');
            });
        });

        input.addEventListener('blur', () => {
            setTimeout(() => suggestions.classList.remove('show'), 200);
        });
    }

    renderSuggestions(container, items, input, rawQuery = '') {
        if (!items || items.length === 0) {
            if (rawQuery.length > 0) {
                container.innerHTML = `
                    <div class="suggestion-item suggestion-direct" data-value="${this.escapeHtml(rawQuery)}">
                        <div class="suggestion-text">
                            <i class="bi bi-search me-1" style="color:#0d6efd;"></i>
                            <span style="color:#0d6efd;font-weight:600;">"${this.escapeHtml(rawQuery)}"</span>
                            <small class="text-muted ms-1">로 직접 검색</small>
                        </div>
                    </div>
                `;
                this._bindSuggestionClicks(container, input);
                container.classList.add('show');
            } else {
                container.classList.remove('show');
            }
            return;
        }

        const directItem = rawQuery.length > 0 ? `
            <div class="suggestion-item suggestion-direct" data-value="${this.escapeHtml(rawQuery)}">
                <div class="suggestion-text">
                    <i class="bi bi-search me-1" style="color:#0d6efd;"></i>
                    <span style="color:#0d6efd;font-weight:600;">"${this.escapeHtml(rawQuery)}"</span>
                    <small class="text-muted ms-1">로 직접 검색</small>
                </div>
            </div>
            <div class="suggestion-divider"></div>
        ` : '';

        container.innerHTML = directItem + items.map(item => `
            <div class="suggestion-item" data-value="${this.escapeHtml(item.value)}">
                <div class="suggestion-text">${this.escapeHtml(item.text)}</div>
                ${item.subtext ? `<small class="text-muted suggestion-subtext">${this.escapeHtml(item.subtext)}</small>` : ''}
            </div>
        `).join('');

        this._bindSuggestionClicks(container, input);
        container.classList.add('show');
    }

    _bindSuggestionClicks(container, input) {
        container.querySelectorAll('.suggestion-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                input.value = el.dataset.value;
                container.classList.remove('show');
                if (el.classList.contains('suggestion-direct')) {
                    setTimeout(() => this.performSearch(), 50);
                }
            });
            el.addEventListener('touchend', (e) => {
                e.preventDefault();
                input.value = el.dataset.value;
                container.classList.remove('show');
                if (el.classList.contains('suggestion-direct')) {
                    setTimeout(() => this.performSearch(), 50);
                }
            }, { passive: false });
        });
    }

    async performSearch() {
        const searchType = document.getElementById('searchType').value;
        const options = { searchType };

        if (searchType === 'building' || searchType === 'complex') {
            options.buildingName = document.getElementById('buildingName').value.trim();
        }
        if (searchType === 'district' || searchType === 'complex') {
            options.district = document.getElementById('districtName').value.trim();
        }
        if (searchType === 'station' || searchType === 'complex') {
            options.station = document.getElementById('stationName').value.trim();
            options.walkingTime = parseInt(document.getElementById('walkingTime').value) || 0;
        }
        if (searchType === 'area' || searchType === 'complex') {
            options.areaFrom = parseFloat(document.getElementById('vacancyAreaFrom').value) || 0;
            options.areaTo = parseFloat(document.getElementById('vacancyAreaTo').value) || 0;
        }

        const hasCondition = ['buildingName','district','station','areaFrom','areaTo']
            .some(k => options[k]);
        if (!hasCondition) {
            alert('검색 조건을 입력해주세요.');
            return;
        }

        try {
            this.showLoading('검색 중...');
            this.currentSearchOptions = options;
            this.currentResults = await FirebaseService.searchVacancies(options);
            this.currentPage = 1;
            this.renderResults();
            this.hideLoading();
        } catch (error) {
            console.error('Search error:', error);
            this.hideLoading();
            this.showError('검색 중 오류가 발생했습니다.');
        }
    }

    async loadAll() {
        try {
            this.showLoading('전체 데이터 로드 중...');
            this.currentSearchOptions = {};
            this.currentResults = await FirebaseService.loadAllDeduped();
            this.currentPage = 1;
            this.renderResults();
            this.hideLoading();
        } catch (error) {
            console.error('Load all error:', error);
            this.hideLoading();
            this.showError('데이터 로드 중 오류가 발생했습니다.');
        }
    }

    resetSearch() {
        ['buildingName','districtName','stationName','walkingTime','vacancyAreaFrom','vacancyAreaTo'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('searchType').value = 'building';
        this.onSearchTypeChange('building');
        this.currentResults = [];
        this.currentGroups = [];
        this.currentSearchOptions = {};
        this.currentPage = 1;
        this.renderResults();
    }

    formatPrice(value) {
        if (value === null || value === undefined || value === '' || value === '-' || value === 0) return '-';
        const num = parseFloat(String(value).replace(/[^0-9.]/g, ''));
        if (isNaN(num) || num === 0) return '-';
        return num.toLocaleString('ko-KR');
    }

    // ===== ★ 그룹핑 헬퍼 =====

    /**
     * 행이 비어있는지 판단 — 면적/금액 모두 비어있으면 빈 행
     */
    isEmptyRow(item) {
        const fields = [item.exclusiveArea, item.rentArea, item.depositPy, item.rentPy, item.maintenancePy];
        return fields.every(v => !v || v === '-' || v === '' || parseFloat(v) === 0);
    }

    /**
     * 발행일을 YYYY-MM 정규화
     */
    normalizeMonth(date) {
        if (!date) return '';
        const str = String(date).replace(/[^0-9]/g, '');
        if (str.length >= 6) return `${str.slice(0,4)}-${str.slice(4,6)}`;
        return str;
    }

    /**
     * 발행연월 표시용 (YYYY.MM)
     */
    formatPublishMonth(date) {
        const m = this.normalizeMonth(date);
        return m ? m.replace('-', '.') : '-';
    }

    /**
     * 그룹 키 = 빌딩명 + 발행회사 + 발행연월
     */
    makeGroupKey(item) {
        const month = this.normalizeMonth(item.publishDate);
        return `${(item.buildingName || '').trim()}__${(item.source || '').trim()}__${month}`;
    }

    /**
     * 층 정렬 비교 (B2 < B1 < 1 < 2 ...)
     */
    compareFloor(a, b) {
        const parse = (f) => {
            if (!f) return 9999;
            const str = String(f).trim();
            if (/^B/i.test(str)) {
                const num = parseInt(str.replace(/[^0-9]/g, '')) || 1;
                return -num;
            }
            const num = parseInt(str.replace(/[^0-9]/g, ''));
            return isNaN(num) ? 9999 : num;
        };
        return parse(a) - parse(b);
    }

    /**
     * 그룹 내 행 정렬 — 면적조건 매칭 행을 상단으로
     */
    sortRowsInGroup(rows, areaFrom, areaTo) {
        const hasAreaFilter = (areaFrom && areaFrom > 0) || (areaTo && areaTo > 0);

        if (!hasAreaFilter) {
            return rows
                .sort((a, b) => this.compareFloor(a.floor, b.floor))
                .map((r, i) => ({ ...r, _isMatch: false, _isTop: i === 0 }));
        }

        const isMatch = (row) => {
            const ex = parseFloat(row.exclusiveArea) || 0;
            const rt = parseFloat(row.rentArea) || 0;
            const area = ex || rt;
            if (!area) return false;
            if (areaFrom > 0 && area < areaFrom) return false;
            if (areaTo > 0 && area > areaTo) return false;
            return true;
        };

        const matched = rows.filter(isMatch).sort((a, b) => this.compareFloor(a.floor, b.floor));
        const rest = rows.filter(r => !isMatch(r)).sort((a, b) => this.compareFloor(a.floor, b.floor));

        return [...matched, ...rest].map((r, i) => ({
            ...r,
            _isMatch: isMatch(r),
            _isTop: i === 0
        }));
    }

    /**
     * 그룹의 우선순위 (정렬 키)
     * - 면적 검색: 매칭 행이 있는 그룹 우선
     * - 그 외: 발행일 최신 우선
     */
    groupSortKey(group, hasAreaFilter) {
        const matchCount = group.rows.filter(r => r._isMatch).length;
        const monthNum = parseInt(this.normalizeMonth(group.publishDate).replace('-', '')) || 0;
        if (hasAreaFilter) {
            // matchCount 많은 순 → 발행일 최신 순
            return [-matchCount, -monthNum];
        }
        return [-monthNum];
    }

    /**
     * 검색 결과 → 그룹 카드로 변환
     */
    groupResults(items, options = {}) {
        // 1. 빈 행 제거
        const validItems = items.filter(item => !this.isEmptyRow(item));

        // 2. 그룹핑
        const groupMap = new Map();
        validItems.forEach(item => {
            const key = this.makeGroupKey(item);
            if (!groupMap.has(key)) {
                groupMap.set(key, {
                    key,
                    buildingName: item.buildingName,
                    source: item.source,
                    publishDate: item.publishDate,
                    publishMonth: this.formatPublishMonth(item.publishDate),
                    address: item.address,
                    nearbyStation: item.nearbyStation,
                    coordinates: item.coordinates,
                    pageImageUrl: item.pageImageUrl,
                    documentId: item.documentId,
                    representativeId: item.id, // 카드 대표 row id (이미지 뷰어/체크박스용)
                    rows: []
                });
            }
            const g = groupMap.get(key);
            g.rows.push(item);
            // 주소/좌표 보강 (첫 row가 없을 경우 다른 row에서 가져옴)
            if (!g.address && item.address) g.address = item.address;
            if (!g.nearbyStation && item.nearbyStation) g.nearbyStation = item.nearbyStation;
            if (!g.coordinates && item.coordinates) g.coordinates = item.coordinates;
        });

        // 3. 각 그룹 내부 행 정렬
        const areaFrom = options.areaFrom || 0;
        const areaTo = options.areaTo || 0;
        const groups = Array.from(groupMap.values());
        groups.forEach(g => {
            g.rows = this.sortRowsInGroup(g.rows, areaFrom, areaTo);
        });

        // 4. 그룹 자체 정렬
        const hasAreaFilter = areaFrom > 0 || areaTo > 0;
        groups.sort((a, b) => {
            const ka = this.groupSortKey(a, hasAreaFilter);
            const kb = this.groupSortKey(b, hasAreaFilter);
            for (let i = 0; i < ka.length; i++) {
                if (ka[i] !== kb[i]) return ka[i] - kb[i];
            }
            return 0;
        });

        return groups;
    }

    // ===== 렌더링 =====

    renderResults() {
        const tbody = document.getElementById('resultsBody');
        const countBadge = document.getElementById('resultCount');

        // 그룹핑
        const groups = this.groupResults(this.currentResults, this.currentSearchOptions);
        this.currentGroups = groups;

        const totalRows = groups.reduce((sum, g) => sum + g.rows.length, 0);
        countBadge.textContent = `${groups.length}개 (${totalRows}건)`;

        if (groups.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center text-muted py-5">
                        <i class="bi bi-inbox fs-1 d-block mb-2"></i>
                        ${this.currentResults.length === 0 ? '검색 결과가 없습니다.' : '유효한 임대안내문이 없습니다.'}
                    </td>
                </tr>
            `;
            document.getElementById('pagination').innerHTML = '';
            return;
        }

        const startIdx = (this.currentPage - 1) * this.pageSize;
        const endIdx = Math.min(startIdx + this.pageSize, groups.length);
        const pageGroups = groups.slice(startIdx, endIdx);

        tbody.innerHTML = pageGroups.map((g, idx) =>
            `<tr class="group-card-row"><td colspan="12" class="p-0 border-0">${this.renderGroupCard(g, startIdx + idx)}</td></tr>`
        ).join('');

        this.bindResultEvents();
        this.renderPagination();
    }

    renderGroupCard(group, idx) {
        const isMultiRow = group.rows.length > 1;
        const topRow = group.rows[0];
        const restRows = group.rows.slice(1);
        const sourceColor = this.getSourceColor(group.source);
        const collapseId = `groupRows-${idx}`;

        return `
        <div class="group-card" data-group-key="${this.escapeHtml(group.key)}">
            <div class="group-card-header">
                <div class="group-card-title">
                    <i class="bi bi-building"></i>
                    <strong>${this.escapeHtml(group.buildingName) || '-'}</strong>
                    <span class="source-badge-inline" style="background:${sourceColor}">
                        ${this.escapeHtml(group.source) || '-'}
                    </span>
                </div>
                <div class="group-card-month">
                    <i class="bi bi-calendar3"></i> ${this.escapeHtml(group.publishMonth)}
                </div>
            </div>

            ${(group.address || group.nearbyStation) ? `
                <div class="group-card-sub">
                    ${group.address ? `<span><i class="bi bi-geo-alt"></i> ${this.escapeHtml(group.address)}</span>` : ''}
                    ${group.nearbyStation ? `<span><i class="bi bi-signpost"></i> ${this.escapeHtml(group.nearbyStation)}</span>` : ''}
                </div>
            ` : ''}

            <div class="group-row-list group-row-list-top">
                ${this.renderGroupRow(topRow, true)}
            </div>

            ${isMultiRow ? `
                <div class="collapse" id="${collapseId}">
                    <div class="group-row-list group-row-list-rest">
                        ${restRows.map(r => this.renderGroupRow(r, false)).join('')}
                    </div>
                </div>
                <button class="group-card-toggle collapsed" type="button"
                        data-bs-toggle="collapse" data-bs-target="#${collapseId}"
                        aria-expanded="false" aria-controls="${collapseId}">
                    <span class="toggle-text-open">
                        <span class="toggle-count-badge">${restRows.length}</span>
                        <span class="toggle-label">개 층 더보기</span>
                        <i class="bi bi-chevron-down toggle-chevron"></i>
                    </span>
                    <span class="toggle-text-close">
                        <i class="bi bi-chevron-up toggle-chevron"></i>
                        <span class="toggle-label">접기</span>
                    </span>
                </button>
            ` : ''}

            <div class="group-card-actions">
                <button class="btn btn-sm btn-outline-primary view-image-btn"
                        data-item-id="${topRow.id}">
                    <i class="bi bi-image"></i> 원본보기
                </button>
                ${group.coordinates ? `
                    <button class="btn btn-sm btn-outline-success view-map-btn"
                            data-lat="${group.coordinates.lat}"
                            data-lng="${group.coordinates.lng}"
                            data-name="${this.escapeHtml(group.buildingName)}">
                        <i class="bi bi-geo-alt"></i> 지도
                    </button>
                ` : ''}
                <label class="form-check form-check-inline ms-auto mb-0">
                    <input type="checkbox" class="form-check-input item-checkbox"
                           data-id="${topRow.id}"
                           ${this.selectedItems.has(topRow.id) ? 'checked' : ''}>
                    <span class="form-check-label small ms-1">선택</span>
                </label>
            </div>
        </div>
        `;
    }

    renderGroupRow(row, isTop) {
        const matchClass = row._isMatch ? 'row-matched' : '';
        const topClass = isTop ? 'is-top' : '';
        const matchBadge = row._isMatch
            ? '<span class="match-badge"><i class="bi bi-check-circle-fill"></i> 매칭</span>'
            : '';

        return `
        <div class="group-row ${matchClass} ${topClass}">
            <div class="row-floor">
                <span class="floor-badge">${this.escapeHtml(row.floor) || '-'}</span>
                ${matchBadge}
            </div>
            <div class="row-areas">
                <div class="area-item">
                    <span class="area-label">전용</span>
                    <span class="area-value">${row.exclusiveArea ? parseFloat(row.exclusiveArea).toFixed(1) : '-'}</span>
                </div>
                <div class="area-item">
                    <span class="area-label">임대</span>
                    <span class="area-value">${row.rentArea ? parseFloat(row.rentArea).toFixed(1) : '-'}</span>
                </div>
            </div>
            <div class="row-prices">
                <div class="price-item price-deposit">
                    <span class="price-label">보증금</span>
                    <span class="price-value">${this.formatPrice(row.depositPy)}</span>
                </div>
                <div class="price-item price-rent">
                    <span class="price-label">임대료</span>
                    <span class="price-value">${this.formatPrice(row.rentPy)}</span>
                </div>
                <div class="price-item price-maint">
                    <span class="price-label">관리비</span>
                    <span class="price-value">${this.formatPrice(row.maintenancePy)}</span>
                </div>
            </div>
        </div>
        `;
    }

    bindResultEvents() {
        document.querySelectorAll('.item-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.target.dataset.id;
                const item = this.currentResults.find(r => r.id === id);
                if (e.target.checked && item) this.selectedItems.set(id, item);
                else this.selectedItems.delete(id);
                this.updateSelectedSection();
            });
        });

        document.querySelectorAll('.view-image-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const itemId = btn.dataset.itemId;
                const item = this.currentResults.find(r => r.id === itemId);
                if (item && item.pageImageUrl) this.showImageViewer(item);
                else alert('이미지 URL이 없습니다.');
            });
        });

        document.querySelectorAll('.view-map-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const lat = parseFloat(btn.dataset.lat);
                const lng = parseFloat(btn.dataset.lng);
                const name = btn.dataset.name;
                if (lat && lng) this.showSingleMarkerMap(lat, lng, name);
            });
        });
    }

    renderPagination() {
        const totalPages = Math.ceil(this.currentGroups.length / this.pageSize);
        const pagination = document.getElementById('pagination');
        if (totalPages <= 1) { pagination.innerHTML = ''; return; }

        let html = `
            <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${this.currentPage - 1}">이전</a>
            </li>
        `;
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, this.currentPage + 2);
        for (let i = startPage; i <= endPage; i++) {
            html += `<li class="page-item ${i === this.currentPage ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${i}">${i}</a>
            </li>`;
        }
        html += `<li class="page-item ${this.currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${this.currentPage + 1}">다음</a>
        </li>`;

        pagination.innerHTML = html;
        pagination.querySelectorAll('.page-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = parseInt(e.target.dataset.page);
                if (page >= 1 && page <= totalPages) {
                    this.currentPage = page;
                    this.renderResults();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        });
    }

    updateSelectedSection() {
        const section = document.getElementById('selectedBuildingsSection');
        const list = document.getElementById('selectedBuildingsList');
        const count = document.getElementById('selectedCount');
        count.textContent = this.selectedItems.size;
        if (this.selectedItems.size === 0) { section.classList.add('d-none'); return; }
        section.classList.remove('d-none');
        list.innerHTML = Array.from(this.selectedItems.values()).map(item => `
            <span class="selected-building-tag">
                ${this.escapeHtml(item.buildingName)} (${this.escapeHtml(item.floor)})
                <button onclick="app.removeSelected('${item.id}')">&times;</button>
            </span>
        `).join('');
    }

    removeSelected(id) {
        this.selectedItems.delete(id);
        this.updateSelectedSection();
        const checkbox = document.querySelector(`.item-checkbox[data-id="${id}"]`);
        if (checkbox) checkbox.checked = false;
    }

    // ===== 이미지 뷰어 =====

    async showImageViewer(item) {
        this.currentViewItem = item;
        this.currentDisplayPageNum = item.pageNum || 1;
        this.resetImageZoom();
        this._zoom.rotation = 0;
        this._zoom.fitMode = 'width';

        await this.loadArchives(item);
        this.updateImageViewer();

        const modal = new bootstrap.Modal(document.getElementById('imageViewerModal'));
        modal.show();
        setTimeout(() => {
            this.setupImageZoom();
            this.applyFitMode();
        }, 400);
    }

    async loadArchives(item) {
        this.archiveList = await FirebaseService.getArchivesBySourceAndBuilding(item.source, item.buildingName);
        this.updateArchiveSelect(item);
    }

    updateArchiveSelect(currentItem) {
        const select = document.getElementById('archiveSelect');
        const container = document.getElementById('archiveSelectContainer');
        if (this.archiveList.length <= 1) { container.classList.add('d-none'); return; }
        container.classList.remove('d-none');
        // 최신순 정렬
        this.archiveList.sort((a, b) => {
            const ma = this.normalizeMonth(a.publishDate).replace('-', '');
            const mb = this.normalizeMonth(b.publishDate).replace('-', '');
            return mb.localeCompare(ma);
        });
        select.innerHTML = this.archiveList.map((archive, idx) => {
            const isSelected = archive.documentId === currentItem.documentId ||
                               archive.publishDate === currentItem.publishDate;
            return `<option value="${idx}" ${isSelected ? 'selected' : ''}>
                ${this.formatPublishMonth(archive.publishDate)} (${archive.source})
            </option>`;
        }).join('');
    }

    async onArchiveSelect(index) {
        const archive = this.archiveList[parseInt(index)];
        if (!archive) return;
        this.currentViewItem = {
            ...this.currentViewItem,
            pageImageUrl: archive.pageImageUrl,
            publishDate: archive.publishDate,
            documentId: archive.documentId,
            pageNum: archive.pageNum || 1
        };
        this.currentDisplayPageNum = archive.pageNum || 1;
        this.resetImageZoom();
        this.updateImageViewer();
    }

    updateImageViewer() {
        const item = this.currentViewItem;
        if (!item) return;
        document.getElementById('imageViewerTitle').textContent = `${item.buildingName} - ${item.floor || ''}`;
        document.getElementById('imageViewerInfo').textContent = `출처: ${item.source} | 발행: ${this.formatPublishMonth(item.publishDate)}`;
        document.getElementById('imageViewerDownload').href = item.pageImageUrl;
        this.loadImageWithFallback(item.pageImageUrl);
        document.getElementById('imageViewerPageInfo').textContent = `${item.source} ${this.currentDisplayPageNum}페이지`;
        document.getElementById('prevPageBtn').disabled = false;
        document.getElementById('nextPageBtn').disabled = false;
    }

    loadImageWithFallback(url) {
        const imgEl = document.getElementById('imageViewerImg');
        imgEl.style.opacity = '0.5';
        const img = new Image();
        img.onload = () => {
            imgEl.src = url;
            imgEl.style.opacity = '1';
            document.getElementById('imageViewerDownload').href = url;
            this.applyImageTransform();
        };
        img.onerror = () => { imgEl.style.opacity = '1'; imgEl.src = url; };
        img.src = url;
    }

    checkImageExists(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
        });
    }

    async findNextValidPage(currentUrl, direction) {
        let attempts = 0, testUrl = currentUrl;
        while (attempts < this.maxPageSearchAttempts) {
            testUrl = this.getAdjacentPageUrl(testUrl, direction);
            if (!testUrl) break;
            attempts++;
            if (await this.checkImageExists(testUrl)) {
                return { url: testUrl, pageOffset: attempts * direction };
            }
        }
        return null;
    }

    async showPrevPage() {
        if (this.isSearchingPage) return;
        const imgEl = document.getElementById('imageViewerImg');
        const newUrl = this.getAdjacentPageUrl(imgEl.src, -1);
        if (!newUrl) return;
        this.isSearchingPage = true;
        imgEl.style.opacity = '0.5';
        this.resetImageZoom();
        if (await this.checkImageExists(newUrl)) {
            this.currentDisplayPageNum--;
            imgEl.src = newUrl;
            imgEl.style.opacity = '1';
            document.getElementById('imageViewerDownload').href = newUrl;
            this.updatePageInfo();
        } else {
            const result = await this.findNextValidPage(imgEl.src, -1);
            if (result) {
                this.currentDisplayPageNum += result.pageOffset;
                imgEl.src = result.url;
                document.getElementById('imageViewerDownload').href = result.url;
                this.updatePageInfo();
            }
            imgEl.style.opacity = '1';
        }
        this.applyImageTransform();
        this.isSearchingPage = false;
    }

    async showNextPage() {
        if (this.isSearchingPage) return;
        const imgEl = document.getElementById('imageViewerImg');
        const newUrl = this.getAdjacentPageUrl(imgEl.src, 1);
        if (!newUrl) return;
        this.isSearchingPage = true;
        imgEl.style.opacity = '0.5';
        this.resetImageZoom();
        if (await this.checkImageExists(newUrl)) {
            this.currentDisplayPageNum++;
            imgEl.src = newUrl;
            imgEl.style.opacity = '1';
            document.getElementById('imageViewerDownload').href = newUrl;
            this.updatePageInfo();
        } else {
            const result = await this.findNextValidPage(imgEl.src, 1);
            if (result) {
                this.currentDisplayPageNum += result.pageOffset;
                imgEl.src = result.url;
                document.getElementById('imageViewerDownload').href = result.url;
                this.updatePageInfo();
            }
            imgEl.style.opacity = '1';
        }
        this.applyImageTransform();
        this.isSearchingPage = false;
    }

    getAdjacentPageUrl(currentUrl, offset) {
        const match = currentUrl.match(/page_(\d+)\.jpg/);
        if (!match) return null;
        const newNum = parseInt(match[1]) + offset;
        if (newNum < 1) return null;
        return currentUrl.replace(/page_\d+\.jpg/, `page_${String(newNum).padStart(3, '0')}.jpg`);
    }

    updatePageInfo() {
        const item = this.currentViewItem;
        if (item) {
            document.getElementById('imageViewerPageInfo').textContent =
                `${item.source} ${this.currentDisplayPageNum}페이지`;
        }
    }

    // ===== 이미지 핀치줌 / 더블탭 줌 + 회전 + Fit 모드 =====

    setupImageZoom() {
        const imgEl = document.getElementById('imageViewerImg');
        if (!imgEl || imgEl._zoomSetup) return;
        imgEl._zoomSetup = true;

        const z = this._zoom;
        imgEl.style.transition = 'transform 0.05s';
        imgEl.style.cursor = 'zoom-in';

        let isDragging = false;
        let dragStartX = 0, dragStartY = 0;
        this._translate = { x: 0, y: 0 };

        // 핀치줌
        imgEl.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                z.startDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                z.lastScale = z.scale;
            }
            if (e.touches.length === 1) {
                const now = Date.now();
                if (now - z.lastTapTime < 280) {
                    e.preventDefault();
                    if (z.scale > 1) {
                        z.scale = 1;
                        this._translate.x = 0;
                        this._translate.y = 0;
                    } else {
                        z.scale = 2.5;
                    }
                    this.applyImageTransform();
                }
                z.lastTapTime = now;
            }
        }, { passive: false });

        imgEl.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                z.scale = Math.min(Math.max(z.lastScale * (dist / z.startDist), 1), 5);
                this.applyImageTransform();
            } else if (e.touches.length === 1 && z.scale > 1) {
                e.preventDefault();
                if (!isDragging) { isDragging = true; dragStartX = e.touches[0].clientX; dragStartY = e.touches[0].clientY; }
                this._translate.x += (e.touches[0].clientX - dragStartX) * 0.5;
                this._translate.y += (e.touches[0].clientY - dragStartY) * 0.5;
                dragStartX = e.touches[0].clientX;
                dragStartY = e.touches[0].clientY;
                this.applyImageTransform();
            }
        }, { passive: false });

        imgEl.addEventListener('touchend', () => {
            isDragging = false;
            if (z.scale < 1.05) {
                z.scale = 1;
                this._translate.x = 0;
                this._translate.y = 0;
                this.applyImageTransform();
            }
        });

        imgEl.addEventListener('dblclick', () => {
            z.scale = z.scale > 1 ? 1 : 2.5;
            if (z.scale === 1) { this._translate.x = 0; this._translate.y = 0; }
            this.applyImageTransform();
        });
    }

    applyImageTransform() {
        const imgEl = document.getElementById('imageViewerImg');
        if (!imgEl) return;
        const z = this._zoom;
        const t = this._translate || { x: 0, y: 0 };
        const rot = z.rotation;
        const scale = z.scale;
        imgEl.style.transformOrigin = 'center center';
        imgEl.style.transform = scale > 1
            ? `rotate(${rot}deg) scale(${scale}) translate(${t.x / scale}px, ${t.y / scale}px)`
            : `rotate(${rot}deg) scale(${scale})`;
        imgEl.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
    }

    resetImageZoom() {
        const z = this._zoom;
        z.scale = 1;
        z.lastScale = 1;
        this._translate = { x: 0, y: 0 };
        const imgEl = document.getElementById('imageViewerImg');
        if (imgEl) {
            imgEl.style.cursor = 'zoom-in';
            this.applyImageTransform();
        }
    }

    // ★ 회전 토글
    toggleImageRotation() {
        this._zoom.rotation = (this._zoom.rotation + 90) % 360;
        this.applyImageTransform();
        this.applyFitMode(); // 회전 시 fit 재적용

        const btn = document.getElementById('imageRotateBtn');
        if (btn) {
            const angles = { 0: '', 90: '90°', 180: '180°', 270: '270°' };
            btn.title = `회전 ${angles[this._zoom.rotation] || ''} (R)`;
        }
    }

    // ★ Fit 모드 토글 (width ↔ all)
    toggleFitMode() {
        this._zoom.fitMode = this._zoom.fitMode === 'width' ? 'all' : 'width';
        this.applyFitMode();
    }

    applyFitMode() {
        const imgEl = document.getElementById('imageViewerImg');
        const container = document.querySelector('#imageViewerModal .modal-body');
        if (!imgEl || !container) return;

        const isRotated = this._zoom.rotation === 90 || this._zoom.rotation === 270;
        const containerW = container.clientWidth;
        const containerH = container.clientHeight;

        // 모든 인라인 스타일 초기화 후 모드별 재적용
        imgEl.style.width = '';
        imgEl.style.height = '';
        imgEl.style.maxWidth = '';
        imgEl.style.maxHeight = '';

        if (this._zoom.fitMode === 'width') {
            // 가로폭 fit: 컨테이너 가로폭에 맞춤 (회전 시 세로폭에 맞춤)
            if (isRotated) {
                imgEl.style.maxHeight = `${containerW}px`;
                imgEl.style.width = 'auto';
            } else {
                imgEl.style.maxWidth = '100%';
                imgEl.style.height = 'auto';
            }
        } else {
            // 전체 fit: 컨테이너 안에 다 들어오게
            if (isRotated) {
                imgEl.style.maxWidth = `${containerH}px`;
                imgEl.style.maxHeight = `${containerW}px`;
            } else {
                imgEl.style.maxWidth = '100%';
                imgEl.style.maxHeight = `${containerH}px`;
            }
            imgEl.style.objectFit = 'contain';
        }

        const fitBtn = document.getElementById('imageFitBtn');
        if (fitBtn) {
            if (this._zoom.fitMode === 'width') {
                fitBtn.innerHTML = '<i class="bi bi-arrows-expand"></i>';
                fitBtn.title = '전체 맞춤 (F)';
            } else {
                fitBtn.innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
                fitBtn.title = '가로폭 맞춤 (F)';
            }
        }
    }

    // ===== 전체화면 =====

    toggleImageFullscreen() {
        const modal = document.querySelector('#imageViewerModal .modal-dialog');
        const btn = document.getElementById('imageFullscreenBtn');
        const imgContainer = document.querySelector('#imageViewerModal .modal-body');

        if (!this._zoom.isFullscreen) {
            modal.classList.add('modal-fullscreen');
            imgContainer.style.maxHeight = '100vh';
            btn.innerHTML = '<i class="bi bi-fullscreen-exit"></i>';
            btn.title = '전체화면 종료 (Esc)';
            this._zoom.isFullscreen = true;
            setTimeout(() => this.applyFitMode(), 100);
        } else {
            this.exitImageFullscreen();
        }
    }

    exitImageFullscreen() {
        const modal = document.querySelector('#imageViewerModal .modal-dialog');
        const btn = document.getElementById('imageFullscreenBtn');
        const imgContainer = document.querySelector('#imageViewerModal .modal-body');
        if (modal) modal.classList.remove('modal-fullscreen');
        if (imgContainer) imgContainer.style.maxHeight = '80vh';
        if (btn) { btn.innerHTML = '<i class="bi bi-fullscreen"></i>'; btn.title = '전체화면'; }
        this._zoom.isFullscreen = false;
        setTimeout(() => this.applyFitMode(), 100);
    }

    // ===== 지도 =====

    showSingleMarkerMap(lat, lng, name) {
        document.getElementById('mapModalTitle').textContent = name;
        const modal = new bootstrap.Modal(document.getElementById('mapModal'));
        modal.show();
        setTimeout(() => { if (window.MapManager) window.MapManager.showSingleMarker(lat, lng, name); }, 300);
    }

    showSelectedOnMap() {
        if (this.selectedItems.size === 0) { alert('선택된 빌딩이 없습니다.'); return; }
        const items = Array.from(this.selectedItems.values()).filter(item => item.coordinates);
        if (items.length === 0) { alert('좌표 정보가 있는 빌딩이 없습니다.'); return; }
        document.getElementById('mapModalTitle').textContent = `선택된 빌딩 ${items.length}개`;
        const modal = new bootstrap.Modal(document.getElementById('mapModal'));
        modal.show();
        setTimeout(() => { if (window.MapManager) window.MapManager.showMultipleMarkers(items); }, 300);
    }

    showLoading(text = '로딩 중...') {
        document.getElementById('loadingText').textContent = text;
        document.getElementById('loadingOverlay').classList.remove('d-none');
        this.isLoading = true;
    }

    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('d-none');
        this.isLoading = false;
    }

    showError(message) { alert(message); }

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new LeasingSearchApp();
});
