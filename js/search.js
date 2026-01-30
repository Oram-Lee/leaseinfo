// Search Controller for Leasing Search App
// Firebase 연동 검색 및 UI 제어

class LeasingSearchApp {
    constructor() {
        this.currentResults = [];
        this.selectedItems = new Map();
        this.currentPage = 1;
        this.pageSize = 20;
        this.isLoading = false;
        this.currentViewIndex = -1;
        this.viewableItems = [];
        this.currentDisplayPageNum = 1;
        
        // 과월호 목록
        this.archiveList = [];
        
        // 검색 결과 내 동일 빌딩의 다른 회사 자료
        this.sameBuildingOtherSources = [];
        this.currentSourceIndex = 0;
        
        // 이미지 탐색 설정
        this.maxPageSearchAttempts = 20;
        this.isSearchingPage = false;
        
        // 출처별 색상 캐시
        this.sourceColorCache = new Map();
        
        // 미리 정의된 색상 팔레트 (구분하기 좋은 색상들)
        this.colorPalette = [
            '#0d6efd', // 파랑
            '#198754', // 초록
            '#dc3545', // 빨강
            '#fd7e14', // 주황
            '#6f42c1', // 보라
            '#20c997', // 청록
            '#e83e8c', // 핑크
            '#005a2b', // 진초록
            '#6610f2', // 인디고
            '#d63384', // 마젠타
            '#0dcaf0', // 시안
            '#ffc107', // 노랑
            '#6c757d', // 회색
            '#0a58ca', // 진파랑
            '#ab2e3c', // 진빨강
            '#087990', // 틸
            '#aa6e2e', // 갈색
            '#5c636a', // 다크그레이
            '#3d8bfd', // 밝은파랑
            '#479f76', // 밝은초록
        ];
        
        this.init();
    }
    
    // 문자열을 해시값으로 변환
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }
    
    // 출처명에 따른 색상 반환
    getSourceColor(source) {
        if (!source) return this.colorPalette[0];
        
        // 캐시된 색상이 있으면 반환
        if (this.sourceColorCache.has(source)) {
            return this.sourceColorCache.get(source);
        }
        
        // 해시 기반으로 색상 선택
        const hash = this.hashString(source);
        const colorIndex = hash % this.colorPalette.length;
        const color = this.colorPalette[colorIndex];
        
        // 캐시에 저장
        this.sourceColorCache.set(source, color);
        
        return color;
    }
    
    // 출처 배지 HTML 생성
    renderSourceBadge(source) {
        const color = this.getSourceColor(source);
        return `<span class="source-badge" style="background-color: ${color};">${this.escapeHtml(source)}</span>`;
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
            console.log('✅ App initialized successfully');
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
        
        document.getElementById('searchBtn').addEventListener('click', () => this.performSearch());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetSearch());
        document.getElementById('loadAllBtn').addEventListener('click', () => this.loadAll());
        
        document.getElementById('pageSize').addEventListener('change', (e) => {
            this.pageSize = parseInt(e.target.value);
            this.currentPage = 1;
            this.renderResults();
        });
        
        ['buildingName', 'districtName', 'stationName', 'walkingTime', 'vacancyAreaFrom', 'vacancyAreaTo'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.performSearch();
                    }
                });
            }
        });
        
        document.getElementById('showSelectedMap').addEventListener('click', () => this.showSelectedOnMap());
        
        // 이미지 뷰어 - 페이지 이동
        document.getElementById('prevPageBtn').addEventListener('click', () => this.showPrevPage());
        document.getElementById('nextPageBtn').addEventListener('click', () => this.showNextPage());
        
        // 타사 자료 이동
        document.getElementById('prevItemBtn').addEventListener('click', () => this.showPrevOtherSource());
        document.getElementById('nextItemBtn').addEventListener('click', () => this.showNextOtherSource());
        
        // 과월호 선택
        document.getElementById('archiveSelect').addEventListener('change', (e) => {
            this.onArchiveSelect(e.target.value);
        });
        
        // 키보드 네비게이션
        document.addEventListener('keydown', (e) => {
            const modal = document.getElementById('imageViewerModal');
            if (modal.classList.contains('show') && !this.isSearchingPage) {
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    this.showPrevPage();
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    this.showNextPage();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.showPrevOtherSource();
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.showNextOtherSource();
                }
            }
        });
    }
    
    onSearchTypeChange(type) {
        document.querySelectorAll('.search-input').forEach(el => el.classList.add('d-none'));
        
        const searchIds = {
            'building': 'buildingSearch',
            'district': 'districtSearch',
            'station': 'stationSearch',
            'area': 'areaSearch',
            'complex': 'complexSearch'
        };
        
        const targetId = searchIds[type];
        if (targetId) document.getElementById(targetId).classList.remove('d-none');
        
        if (type === 'complex') {
            ['buildingSearch', 'districtSearch', 'stationSearch', 'areaSearch'].forEach(id => {
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
                    this.renderSuggestions(suggestions, items, input);
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
            setTimeout(() => suggestions.classList.remove('show'), 200);
        });
    }
    
    renderSuggestions(container, items, input) {
        if (!items || items.length === 0) {
            container.classList.remove('show');
            return;
        }
        
        container.innerHTML = items.map(item => `
            <div class="suggestion-item" data-value="${item.value}">
                <div class="suggestion-text">${item.text}</div>
                ${item.subtext ? `<small class="text-muted suggestion-subtext">${item.subtext}</small>` : ''}
            </div>
        `).join('');
        
        container.querySelectorAll('.suggestion-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                input.value = el.dataset.value;
                container.classList.remove('show');
            });
        });
        
        container.classList.add('show');
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
            this.currentResults = await FirebaseService.loadMergedData();
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
        ['buildingName', 'districtName', 'stationName', 'walkingTime', 'vacancyAreaFrom', 'vacancyAreaTo'].forEach(id => {
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
        const numStr = String(value).replace(/[^0-9.]/g, '');
        const num = parseFloat(numStr);
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
                <td class="price-cell">
                    <span class="price-value">${item.exclusiveArea ? parseFloat(item.exclusiveArea).toFixed(1) : '-'}</span>
                </td>
                <td class="price-cell">
                    <span class="price-value">${item.rentArea ? parseFloat(item.rentArea).toFixed(1) : '-'}</span>
                </td>
                <td class="price-cell">
                    <span class="price-value">${this.formatPrice(item.depositPy) || '-'}</span>
                </td>
                <td class="price-cell">
                    <span class="price-value">${this.formatPrice(item.rentPy) || '-'}</span>
                </td>
                <td class="price-cell">
                    <span class="price-value">${this.formatPrice(item.maintenancePy) || '-'}</span>
                </td>
                <td>
                    ${this.renderSourceBadge(item.source)}
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-primary view-image-btn" 
                            data-item-id="${item.id}"
                            data-image="${this.escapeHtml(item.pageImageUrl)}"
                            data-title="${this.escapeHtml(item.buildingName)} - ${this.escapeHtml(item.floor)}"
                            data-info="출처: ${this.escapeHtml(item.source)} | 발행: ${this.escapeHtml(item.publishDate)}">
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
                
                if (e.target.checked && item) {
                    this.selectedItems.set(id, item);
                } else {
                    this.selectedItems.delete(id);
                }
                this.updateSelectedSection();
            });
        });
        
        document.querySelectorAll('.view-image-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const itemId = btn.dataset.itemId;
                const item = this.currentResults.find(r => r.id === itemId);
                if (item && item.pageImageUrl) {
                    this.showImageViewer(item);
                } else {
                    alert('이미지 URL이 없습니다.');
                }
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
        
        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }
        
        let html = `
            <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${this.currentPage - 1}">이전</a>
            </li>
        `;
        
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, this.currentPage + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            html += `
                <li class="page-item ${i === this.currentPage ? 'active' : ''}">
                    <a class="page-link" href="#" data-page="${i}">${i}</a>
                </li>
            `;
        }
        
        html += `
            <li class="page-item ${this.currentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${this.currentPage + 1}">다음</a>
            </li>
        `;
        
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
        
        if (this.selectedItems.size === 0) {
            section.classList.add('d-none');
            return;
        }
        
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
        // 현재 항목 설정
        this.currentViewItem = item;
        this.currentDisplayPageNum = item.pageNum || 1;
        
        // 검색 결과 내 동일 빌딩의 다른 회사 자료 찾기
        this.findSameBuildingOtherSources(item);
        
        // 과월호 로드
        await this.loadArchives(item);
        
        this.updateImageViewer();
        
        const modal = new bootstrap.Modal(document.getElementById('imageViewerModal'));
        modal.show();
    }
    
    // 검색 결과 내에서 동일 빌딩/다른 회사 찾기
    findSameBuildingOtherSources(currentItem) {
        // 검색 결과에서 같은 빌딩명의 항목들 찾기
        const sameBuildingItems = this.currentResults.filter(item => 
            item.buildingName === currentItem.buildingName && 
            item.pageImageUrl
        );
        
        // 회사별로 최신 자료만 선택 (중복 제거)
        const sourceMap = new Map();
        sameBuildingItems.forEach(item => {
            const existing = sourceMap.get(item.source);
            if (!existing) {
                sourceMap.set(item.source, item);
            } else {
                // 더 최신 발행일이면 교체
                const existingDate = FirebaseService.parsePublishDate(existing.publishDate);
                const itemDate = FirebaseService.parsePublishDate(item.publishDate);
                if (itemDate > existingDate) {
                    sourceMap.set(item.source, item);
                }
            }
        });
        
        // 발행일 최신순 정렬
        this.sameBuildingOtherSources = Array.from(sourceMap.values()).sort((a, b) => {
            const dateA = FirebaseService.parsePublishDate(a.publishDate);
            const dateB = FirebaseService.parsePublishDate(b.publishDate);
            return dateB - dateA;
        });
        
        // 현재 항목의 인덱스 찾기
        this.currentSourceIndex = this.sameBuildingOtherSources.findIndex(
            item => item.source === currentItem.source
        );
        
        console.log(`🏢 Same building "${currentItem.buildingName}": ${this.sameBuildingOtherSources.length} sources found`);
    }
    
    async loadArchives(item) {
        this.archiveList = await FirebaseService.getArchivesBySourceAndBuilding(item.source, item.buildingName);
        this.updateArchiveSelect(item);
    }
    
    updateArchiveSelect(currentItem) {
        const select = document.getElementById('archiveSelect');
        const container = document.getElementById('archiveSelectContainer');
        
        if (this.archiveList.length <= 1) {
            container.classList.add('d-none');
            return;
        }
        
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
        
        // 현재 항목 업데이트
        this.currentViewItem = {
            ...this.currentViewItem,
            pageImageUrl: archive.pageImageUrl,
            publishDate: archive.publishDate,
            documentId: archive.documentId,
            pageNum: archive.pageNum || 1
        };
        
        this.currentDisplayPageNum = archive.pageNum || 1;
        this.updateImageViewer();
    }
    
    updateImageViewer() {
        const item = this.currentViewItem;
        if (!item) return;
        
        const title = `${item.buildingName} - ${item.floor}`;
        const info = `출처: ${item.source} | 발행: ${item.publishDate}`;
        
        document.getElementById('imageViewerTitle').textContent = title;
        document.getElementById('imageViewerInfo').textContent = info;
        document.getElementById('imageViewerDownload').href = item.pageImageUrl;
        
        this.loadImageWithFallback(item.pageImageUrl);
        
        // 페이지 정보
        document.getElementById('imageViewerPageInfo').textContent = 
            `${item.source} ${this.currentDisplayPageNum}페이지`;
        
        document.getElementById('prevPageBtn').disabled = false;
        document.getElementById('nextPageBtn').disabled = false;
        
        // 타사 네비게이션 업데이트
        this.updateOtherSourcesNavigation();
    }
    
    updateOtherSourcesNavigation() {
        const prevBtn = document.getElementById('prevItemBtn');
        const nextBtn = document.getElementById('nextItemBtn');
        const prevInfo = document.getElementById('prevItemInfo');
        const nextInfo = document.getElementById('nextItemInfo');
        const indexBadge = document.getElementById('itemIndexBadge');
        
        const totalSources = this.sameBuildingOtherSources.length;
        
        if (totalSources <= 1) {
            indexBadge.textContent = '타사 자료 없음';
            prevInfo.textContent = '-';
            nextInfo.textContent = '-';
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            return;
        }
        
        indexBadge.textContent = `${this.currentSourceIndex + 1} / ${totalSources} 회사`;
        
        // 이전 회사
        if (this.currentSourceIndex > 0) {
            const prevSource = this.sameBuildingOtherSources[this.currentSourceIndex - 1];
            prevInfo.textContent = `${prevSource.source} (${prevSource.publishDate})`;
            prevBtn.disabled = false;
        } else {
            prevInfo.textContent = '처음';
            prevBtn.disabled = true;
        }
        
        // 다음 회사
        if (this.currentSourceIndex < totalSources - 1) {
            const nextSource = this.sameBuildingOtherSources[this.currentSourceIndex + 1];
            nextInfo.textContent = `${nextSource.source} (${nextSource.publishDate})`;
            nextBtn.disabled = false;
        } else {
            nextInfo.textContent = '마지막';
            nextBtn.disabled = true;
        }
    }
    
    // ===== 이미지 로드 =====
    
    loadImageWithFallback(url) {
        const imgEl = document.getElementById('imageViewerImg');
        imgEl.style.opacity = '0.5';
        
        const img = new Image();
        img.onload = () => {
            imgEl.src = url;
            imgEl.style.opacity = '1';
            document.getElementById('imageViewerDownload').href = url;
        };
        img.onerror = () => {
            console.log('⚠️ Image not found:', url);
            imgEl.style.opacity = '1';
            imgEl.src = url;
        };
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
        let attempts = 0;
        let testUrl = currentUrl;
        
        while (attempts < this.maxPageSearchAttempts) {
            testUrl = this.getAdjacentPageUrl(testUrl, direction);
            if (!testUrl) break;
            
            attempts++;
            const exists = await this.checkImageExists(testUrl);
            
            if (exists) {
                console.log(`✅ Found valid page after ${attempts} attempts`);
                return { url: testUrl, pageOffset: attempts * direction };
            }
        }
        
        console.log(`❌ No valid page found after ${attempts} attempts`);
        return null;
    }
    
    // ===== 페이지 이동 =====
    
    async showPrevPage() {
        if (this.isSearchingPage) return;
        
        const imgEl = document.getElementById('imageViewerImg');
        const currentUrl = imgEl.src;
        
        const newUrl = this.getAdjacentPageUrl(currentUrl, -1);
        if (!newUrl) return;
        
        this.isSearchingPage = true;
        imgEl.style.opacity = '0.5';
        
        const exists = await this.checkImageExists(newUrl);
        
        if (exists) {
            this.currentDisplayPageNum--;
            imgEl.src = newUrl;
            imgEl.style.opacity = '1';
            document.getElementById('imageViewerDownload').href = newUrl;
            this.updatePageInfo();
        } else {
            const result = await this.findNextValidPage(currentUrl, -1);
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
        const currentUrl = imgEl.src;
        
        const newUrl = this.getAdjacentPageUrl(currentUrl, 1);
        if (!newUrl) return;
        
        this.isSearchingPage = true;
        imgEl.style.opacity = '0.5';
        
        const exists = await this.checkImageExists(newUrl);
        
        if (exists) {
            this.currentDisplayPageNum++;
            imgEl.src = newUrl;
            imgEl.style.opacity = '1';
            document.getElementById('imageViewerDownload').href = newUrl;
            this.updatePageInfo();
        } else {
            const result = await this.findNextValidPage(currentUrl, 1);
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
        const pageMatch = currentUrl.match(/page_(\d+)\.jpg/);
        if (!pageMatch) return null;
        
        const currentPageNum = parseInt(pageMatch[1]);
        const newPageNum = currentPageNum + offset;
        
        if (newPageNum < 1) return null;
        
        const newPageStr = String(newPageNum).padStart(3, '0');
        return currentUrl.replace(/page_\d+\.jpg/, `page_${newPageStr}.jpg`);
    }
    
    updatePageInfo() {
        const item = this.currentViewItem;
        if (item) {
            document.getElementById('imageViewerPageInfo').textContent = 
                `${item.source} ${this.currentDisplayPageNum}페이지`;
        }
    }
    
    // ===== 타사 자료 이동 =====
    
    async showPrevOtherSource() {
        if (this.currentSourceIndex <= 0) return;
        
        this.currentSourceIndex--;
        await this.switchToSource(this.sameBuildingOtherSources[this.currentSourceIndex]);
    }
    
    async showNextOtherSource() {
        if (this.currentSourceIndex >= this.sameBuildingOtherSources.length - 1) return;
        
        this.currentSourceIndex++;
        await this.switchToSource(this.sameBuildingOtherSources[this.currentSourceIndex]);
    }
    
    async switchToSource(sourceItem) {
        if (!sourceItem) return;
        
        // 현재 항목을 새 회사의 자료로 변경
        this.currentViewItem = { ...sourceItem };
        this.currentDisplayPageNum = sourceItem.pageNum || 1;
        
        // 새 회사의 과월호 로드
        await this.loadArchives(sourceItem);
        
        this.updateImageViewer();
    }
    
    // ===== 기타 =====
    
    showSingleMarkerMap(lat, lng, name) {
        document.getElementById('mapModalTitle').textContent = name;
        
        const modal = new bootstrap.Modal(document.getElementById('mapModal'));
        modal.show();
        
        setTimeout(() => {
            if (window.MapManager) {
                window.MapManager.showSingleMarker(lat, lng, name);
            }
        }, 300);
    }
    
    showSelectedOnMap() {
        if (this.selectedItems.size === 0) {
            alert('선택된 빌딩이 없습니다.');
            return;
        }
        
        const items = Array.from(this.selectedItems.values()).filter(item => item.coordinates);
        
        if (items.length === 0) {
            alert('좌표 정보가 있는 빌딩이 없습니다.');
            return;
        }
        
        document.getElementById('mapModalTitle').textContent = `선택된 빌딩 ${items.length}개`;
        
        const modal = new bootstrap.Modal(document.getElementById('mapModal'));
        modal.show();
        
        setTimeout(() => {
            if (window.MapManager) {
                window.MapManager.showMultipleMarkers(items);
            }
        }, 300);
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
    
    showError(message) {
        alert(message);
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 앱 초기화
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new LeasingSearchApp();
});
