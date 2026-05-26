// Search Controller for Leasing Search App
// Firebase 연동 검색 및 UI 제어

class LeasingSearchApp {
    constructor() {
        this.currentResults = [];
        this.selectedItems = new Map();
        this.currentPage = 1;
        this.pageSize = 20;
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

        // 이미지 줌 상태
        this._zoom = { scale: 1, lastScale: 1, startDist: 0, lastTapTime: 0, isFullscreen: false };

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
        console.log('🚀 Initializing Leasing Search App...');
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
            // 검색 버튼 클릭 시 열린 suggestion 먼저 닫고 검색
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

        // Enter 키 검색 (모든 입력 필드)
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

        // 이미지 뷰어 - 페이지 이동
        document.getElementById('prevPageBtn').addEventListener('click', () => this.showPrevPage());
        document.getElementById('nextPageBtn').addEventListener('click', () => this.showNextPage());

        // 과월호 선택
        document.getElementById('archiveSelect').addEventListener('change', (e) => {
            this.onArchiveSelect(e.target.value);
        });

        // 전체화면 버튼
        const fullscreenBtn = document.getElementById('imageFullscreenBtn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => this.toggleImageFullscreen());
        }

        // 키보드 네비게이션
        document.addEventListener('keydown', (e) => {
            const modal = document.getElementById('imageViewerModal');
            if (modal.classList.contains('show') && !this.isSearchingPage) {
                if (e.key === 'ArrowLeft') { e.preventDefault(); this.showPrevPage(); }
                else if (e.key === 'ArrowRight') { e.preventDefault(); this.showNextPage(); }
                else if (e.key === 'Escape') { this.exitImageFullscreen(); }
            }
        });

        // 모달 닫힐 때 줌 초기화
        document.getElementById('imageViewerModal').addEventListener('hidden.bs.modal', () => {
            this.resetImageZoom();
            this.exitImageFullscreen();
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

        // ★ 모바일 UX: enterKeyHint 속성 추가
        input.setAttribute('enterkeyhint', 'search');

        let debounceTimer = null;

        input.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            if (debounceTimer) clearTimeout(debounceTimer);

            document.querySelectorAll('.suggestions').forEach(s => {
                if (s.id !== suggestionsId) s.classList.remove('show');
            });

            if (query.length < 1) {
                suggestions.classList.remove('show');
                return;
            }

            debounceTimer = setTimeout(async () => {
                try {
                    const items = await fetchFn(query);
                    // ★ 현재 입력값 전달 (직접 검색 옵션 렌더링용)
                    this.renderSuggestions(suggestions, items, input, query);
                } catch (error) {
                    console.error('Autocomplete error:', error);
                }
            }, 200);
        });

        input.addEventListener('focus', () => {
            document.querySelectorAll('.suggestions').forEach(s => {
                if (s.id !== suggestionsId) s.classList.remove('show');
            });
        });

        input.addEventListener('blur', () => {
            // ★ blur 시 suggestion만 닫고 input 값은 유지
            setTimeout(() => suggestions.classList.remove('show'), 200);
        });
    }

    renderSuggestions(container, items, input, rawQuery = '') {
        if (!items || items.length === 0) {
            // 매칭 결과 없어도 직접 검색 옵션은 표시
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

        // ★ 상단에 "직접 검색" 항목 추가 (모바일에서 suggestion 강요 방지)
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
                // ★ 직접 검색 항목 클릭 시 즉시 검색 실행
                if (el.classList.contains('suggestion-direct')) {
                    setTimeout(() => this.performSearch(), 50);
                }
            });

            // 터치 이벤트도 동일하게 처리
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
        const options = {};

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

        const hasCondition = Object.values(options).some(v => v);
        if (!hasCondition) {
            alert('검색 조건을 입력해주세요.');
            return;
        }

        try {
            this.showLoading('검색 중...');
            // ★ searchVacancies 내부에서 최신버전 중복제거 자동 적용
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
            // ★ loadAllDeduped: 최신버전 중복제거 적용
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
        this.currentPage = 1;
        this.renderResults();
    }

    formatPrice(value) {
        if (!value || value === '-' || value === '') return '-';
        const num = parseFloat(String(value).replace(/[^0-9.]/g, ''));
        if (isNaN(num)) return value;
        return num.toLocaleString('ko-KR');
    }

    renderResults() {
        const tbody = document.getElementById('resultsBody');
        const countBadge = document.getElementById('resultCount');
        countBadge.textContent = this.currentResults.length;

        if (this.currentResults.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center text-muted py-5">
                        <i class="bi bi-inbox fs-1 d-block mb-2"></i>
                        검색 결과가 없습니다.
                    </td>
                </tr>
            `;
            document.getElementById('pagination').innerHTML = '';
            return;
        }

        const startIdx = (this.currentPage - 1) * this.pageSize;
        const endIdx = Math.min(startIdx + this.pageSize, this.currentResults.length);
        const pageItems = this.currentResults.slice(startIdx, endIdx);

        tbody.innerHTML = pageItems.map(item => `
            <tr data-id="${item.id}">
                <td>
                    <input type="checkbox" class="form-check-input item-checkbox"
                           data-id="${item.id}" ${this.selectedItems.has(item.id) ? 'checked' : ''}>
                </td>
                <td><strong>${this.escapeHtml(item.buildingName)}</strong></td>
                <td>${this.escapeHtml(item.address) || '-'}</td>
                <td>${this.escapeHtml(item.nearbyStation) || '-'}</td>
                <td><span class="badge bg-secondary">${this.escapeHtml(item.floor)}</span></td>
                <td class="price-cell"><span class="price-value">${item.exclusiveArea ? parseFloat(item.exclusiveArea).toFixed(1) : '-'}</span></td>
                <td class="price-cell"><span class="price-value">${item.rentArea ? parseFloat(item.rentArea).toFixed(1) : '-'}</span></td>
                <td class="price-cell"><span class="price-value">${this.formatPrice(item.depositPy) || '-'}</span></td>
                <td class="price-cell"><span class="price-value">${this.formatPrice(item.rentPy) || '-'}</span></td>
                <td class="price-cell"><span class="price-value">${this.formatPrice(item.maintenancePy) || '-'}</span></td>
                <td>${this.renderSourceBadge(item.source)}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary view-image-btn"
                            data-item-id="${item.id}"
                            data-image="${this.escapeHtml(item.pageImageUrl)}">
                        <i class="bi bi-image"></i> 보기
                    </button>
                    ${item.coordinates ? `
                        <button class="btn btn-sm btn-outline-success view-map-btn"
                                data-lat="${item.coordinates.lat}"
                                data-lng="${item.coordinates.lng}"
                                data-name="${this.escapeHtml(item.buildingName)}">
                            <i class="bi bi-geo-alt"></i>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');

        this.bindResultEvents();
        this.renderPagination();
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
        const totalPages = Math.ceil(this.currentResults.length / this.pageSize);
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

        await this.loadArchives(item);
        this.updateImageViewer();

        const modal = new bootstrap.Modal(document.getElementById('imageViewerModal'));
        modal.show();

        // 모달 표시 후 핀치줌 설정
        setTimeout(() => this.setupImageZoom(), 400);
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
        select.innerHTML = this.archiveList.map((archive, idx) => {
            const isSelected = archive.documentId === currentItem.documentId ||
                               archive.publishDate === currentItem.publishDate;
            return `<option value="${idx}" ${isSelected ? 'selected' : ''}>
                ${archive.publishDate} (${archive.source})
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
        document.getElementById('imageViewerTitle').textContent = `${item.buildingName} - ${item.floor}`;
        document.getElementById('imageViewerInfo').textContent = `출처: ${item.source} | 발행: ${item.publishDate}`;
        document.getElementById('imageViewerDownload').href = item.pageImageUrl;
        this.loadImageWithFallback(item.pageImageUrl);
        document.getElementById('imageViewerPageInfo').textContent = `${item.source} ${this.currentDisplayPageNum}페이지`;
        document.getElementById('prevPageBtn').disabled = false;
        document.getElementById('nextPageBtn').disabled = false;
    }

    loadImageWithFallback(url) {
        const imgEl = document.getElementById('imageViewerImg');
        imgEl.style.opacity = '0.5';
        imgEl.style.transform = 'scale(1)'; // 줌 초기화
        const img = new Image();
        img.onload = () => { imgEl.src = url; imgEl.style.opacity = '1'; document.getElementById('imageViewerDownload').href = url; };
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

    // ===== 페이지 이동 =====

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

    // ===== ★ 모바일 이미지 핀치줌 / 더블탭 줌 =====

    setupImageZoom() {
        const imgEl = document.getElementById('imageViewerImg');
        if (!imgEl || imgEl._zoomSetup) return;
        imgEl._zoomSetup = true;

        const z = this._zoom;
        imgEl.style.transformOrigin = 'center center';
        imgEl.style.transition = 'transform 0.05s';
        imgEl.style.cursor = 'zoom-in';

        let isDragging = false;
        let dragStartX = 0, dragStartY = 0;
        let translateX = 0, translateY = 0;

        const applyTransform = () => {
            imgEl.style.transform = z.scale > 1
                ? `scale(${z.scale}) translate(${translateX / z.scale}px, ${translateY / z.scale}px)`
                : 'scale(1) translate(0, 0)';
            imgEl.style.cursor = z.scale > 1 ? 'grab' : 'zoom-in';
        };

        // 핀치줌 (2손가락)
        imgEl.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                z.startDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                z.lastScale = z.scale;
            }
            // 더블탭 감지
            if (e.touches.length === 1) {
                const now = Date.now();
                if (now - z.lastTapTime < 280) {
                    e.preventDefault();
                    if (z.scale > 1) {
                        z.scale = 1;
                        translateX = 0;
                        translateY = 0;
                    } else {
                        // 탭한 위치 기준으로 2.5배 줌
                        z.scale = 2.5;
                    }
                    applyTransform();
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
                applyTransform();
            } else if (e.touches.length === 1 && z.scale > 1) {
                // 줌인 상태에서 드래그 패닝
                e.preventDefault();
                if (!isDragging) { isDragging = true; dragStartX = e.touches[0].clientX; dragStartY = e.touches[0].clientY; }
                translateX += (e.touches[0].clientX - dragStartX) * 0.5;
                translateY += (e.touches[0].clientY - dragStartY) * 0.5;
                dragStartX = e.touches[0].clientX;
                dragStartY = e.touches[0].clientY;
                applyTransform();
            }
        }, { passive: false });

        imgEl.addEventListener('touchend', () => {
            isDragging = false;
            // 최소 스케일 보정
            if (z.scale < 1.05) {
                z.scale = 1; translateX = 0; translateY = 0;
                applyTransform();
            }
        });

        // PC: 더블클릭 줌
        imgEl.addEventListener('dblclick', () => {
            z.scale = z.scale > 1 ? 1 : 2.5;
            if (z.scale === 1) { translateX = 0; translateY = 0; }
            applyTransform();
        });
    }

    resetImageZoom() {
        const imgEl = document.getElementById('imageViewerImg');
        if (imgEl) {
            this._zoom.scale = 1;
            this._zoom.lastScale = 1;
            imgEl.style.transform = 'scale(1) translate(0,0)';
            imgEl.style.cursor = 'zoom-in';
        }
    }

    // ===== ★ 전체화면 =====

    toggleImageFullscreen() {
        const modal = document.querySelector('#imageViewerModal .modal-dialog');
        const btn = document.getElementById('imageFullscreenBtn');
        const imgContainer = document.querySelector('#imageViewerModal .modal-body');

        if (!this._zoom.isFullscreen) {
            // 전체화면 진입
            modal.classList.add('modal-fullscreen');
            imgContainer.style.maxHeight = '100vh';
            btn.innerHTML = '<i class="bi bi-fullscreen-exit"></i>';
            btn.title = '전체화면 종료 (Esc)';
            this._zoom.isFullscreen = true;
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
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new LeasingSearchApp();
});
