// Search Controller for Leasing Search App
// Firebase 연동 검색 및 UI 제어

class LeasingSearchApp {
    constructor() {
        this.currentResults = [];
        this.selectedItems = new Map();
        this.currentPage = 1;
        this.pageSize = 20;
        this.isLoading = false;
        this.currentViewIndex = -1; // 현재 보고 있는 이미지 인덱스
        this.viewableItems = []; // 이미지가 있는 항목들
        
        this.init();
    }
    
    async init() {
        console.log('🚀 Initializing Leasing Search App...');
        
        this.bindEvents();
        this.setupAutocomplete();
        
        // 초기 데이터 로드 및 마지막 업데이트 시간 표시
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
        // 검색 유형 변경
        document.getElementById('searchType').addEventListener('change', (e) => {
            this.onSearchTypeChange(e.target.value);
        });
        
        // 검색 버튼
        document.getElementById('searchBtn').addEventListener('click', () => {
            this.performSearch();
        });
        
        // 초기화 버튼
        document.getElementById('resetBtn').addEventListener('click', () => {
            this.resetSearch();
        });
        
        // 전체 보기 버튼
        document.getElementById('loadAllBtn').addEventListener('click', () => {
            this.loadAll();
        });
        
        // 페이지 크기 변경
        document.getElementById('pageSize').addEventListener('change', (e) => {
            this.pageSize = parseInt(e.target.value);
            this.currentPage = 1;
            this.renderResults();
        });
        
        // Enter 키로 검색 - 모든 입력 필드
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
        
        // 선택 빌딩 지도보기
        document.getElementById('showSelectedMap').addEventListener('click', () => {
            this.showSelectedOnMap();
        });
        
        // 이미지 뷰어 이전/다음 버튼
        document.getElementById('prevImageBtn').addEventListener('click', () => {
            this.showPrevImage();
        });
        
        document.getElementById('nextImageBtn').addEventListener('click', () => {
            this.showNextImage();
        });
        
        // 키보드로 이미지 네비게이션 (좌우 화살표)
        document.addEventListener('keydown', (e) => {
            const modal = document.getElementById('imageViewerModal');
            if (modal.classList.contains('show')) {
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    this.showPrevImage();
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    this.showNextImage();
                }
            }
        });
    }
    
    onSearchTypeChange(type) {
        // 모든 검색 입력 숨기기
        document.querySelectorAll('.search-input').forEach(el => {
            el.classList.add('d-none');
        });
        
        // 선택된 유형만 표시
        const searchIds = {
            'building': 'buildingSearch',
            'district': 'districtSearch',
            'station': 'stationSearch',
            'area': 'areaSearch',
            'complex': 'complexSearch'
        };
        
        const targetId = searchIds[type];
        if (targetId) {
            document.getElementById(targetId).classList.remove('d-none');
        }
        
        // 복합검색일 경우 모든 필드 표시
        if (type === 'complex') {
            ['buildingSearch', 'districtSearch', 'stationSearch', 'areaSearch'].forEach(id => {
                document.getElementById(id).classList.remove('d-none');
            });
        }
    }
    
    setupAutocomplete() {
        // 빌딩명 자동완성
        this.setupAutocompleteField('buildingName', 'buildingSuggestions', async (query) => {
            const suggestions = await FirebaseService.getBuildingNameSuggestions(query);
            return suggestions.map(s => ({
                text: s.name,
                subtext: s.address,
                value: s.name
            }));
        });
        
        // 지역명 자동완성
        this.setupAutocompleteField('districtName', 'districtSuggestions', async (query) => {
            const suggestions = await FirebaseService.getDistrictSuggestions(query);
            return suggestions.map(s => ({
                text: s,
                value: s
            }));
        });
        
        // 역명 자동완성
        this.setupAutocompleteField('stationName', 'stationSuggestions', async (query) => {
            const suggestions = await FirebaseService.getStationSuggestions(query);
            return suggestions.map(s => ({
                text: s,
                value: s
            }));
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
            
            // 다른 모든 suggestions 닫기
            document.querySelectorAll('.suggestions').forEach(s => {
                if (s.id !== suggestionsId) {
                    s.classList.remove('show');
                }
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
        
        // input focus 시 다른 suggestions 닫기
        input.addEventListener('focus', () => {
            document.querySelectorAll('.suggestions').forEach(s => {
                if (s.id !== suggestionsId) {
                    s.classList.remove('show');
                }
            });
        });
        
        input.addEventListener('blur', () => {
            setTimeout(() => {
                suggestions.classList.remove('show');
            }, 200);
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
                e.preventDefault(); // blur 이벤트 방지
                input.value = el.dataset.value;
                container.classList.remove('show');
            });
        });
        
        container.classList.add('show');
    }
    
    async performSearch() {
        const searchType = document.getElementById('searchType').value;
        
        const options = {};
        
        // 검색 조건 수집
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
        
        // 검색 조건 유효성 검사
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
        // 입력 필드 초기화
        ['buildingName', 'districtName', 'stationName', 'walkingTime', 'vacancyAreaFrom', 'vacancyAreaTo'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        
        // 검색 유형 초기화
        document.getElementById('searchType').value = 'building';
        this.onSearchTypeChange('building');
        
        // 결과 초기화
        this.currentResults = [];
        this.currentPage = 1;
        this.renderResults();
    }
    
    renderResults() {
        const tbody = document.getElementById('resultsBody');
        const countBadge = document.getElementById('resultCount');
        
        countBadge.textContent = this.currentResults.length;
        
        if (this.currentResults.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-muted py-5">
                        <i class="bi bi-inbox fs-1 d-block mb-2"></i>
                        검색 결과가 없습니다.
                    </td>
                </tr>
            `;
            document.getElementById('pagination').innerHTML = '';
            return;
        }
        
        // 페이지네이션 계산
        const startIdx = (this.currentPage - 1) * this.pageSize;
        const endIdx = Math.min(startIdx + this.pageSize, this.currentResults.length);
        const pageItems = this.currentResults.slice(startIdx, endIdx);
        
        // 테이블 렌더링
        tbody.innerHTML = pageItems.map(item => `
            <tr data-id="${item.id}">
                <td>
                    <input type="checkbox" class="form-check-input item-checkbox" 
                           data-id="${item.id}" ${this.selectedItems.has(item.id) ? 'checked' : ''}>
                </td>
                <td>
                    <strong>${this.escapeHtml(item.buildingName)}</strong>
                </td>
                <td>${this.escapeHtml(item.address) || '-'}</td>
                <td>${this.escapeHtml(item.nearbyStation) || '-'}</td>
                <td><span class="badge bg-secondary">${this.escapeHtml(item.floor)}</span></td>
                <td>${item.exclusiveArea ? parseFloat(item.exclusiveArea).toFixed(2) : '-'}</td>
                <td>${item.rentArea ? parseFloat(item.rentArea).toFixed(2) : '-'}</td>
                <td>
                    <span class="source-badge ${this.escapeHtml(item.source)}">${this.escapeHtml(item.source)}</span>
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
        
        // 이벤트 바인딩
        this.bindResultEvents();
        
        // 페이지네이션 렌더링
        this.renderPagination();
    }
    
    bindResultEvents() {
        // 체크박스 이벤트
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
        
        // 이미지 보기 버튼
        document.querySelectorAll('.view-image-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const imageUrl = btn.dataset.image;
                const title = btn.dataset.title;
                const info = btn.dataset.info;
                const itemId = btn.dataset.itemId;
                
                if (imageUrl) {
                    this.showImageViewer(imageUrl, title, info, itemId);
                } else {
                    alert('이미지 URL이 없습니다.');
                }
            });
        });
        
        // 지도 보기 버튼
        document.querySelectorAll('.view-map-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const lat = parseFloat(btn.dataset.lat);
                const lng = parseFloat(btn.dataset.lng);
                const name = btn.dataset.name;
                
                if (lat && lng) {
                    this.showSingleMarkerMap(lat, lng, name);
                }
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
        
        let html = '';
        
        // 이전 버튼
        html += `
            <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${this.currentPage - 1}">이전</a>
            </li>
        `;
        
        // 페이지 번호
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, this.currentPage + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            html += `
                <li class="page-item ${i === this.currentPage ? 'active' : ''}">
                    <a class="page-link" href="#" data-page="${i}">${i}</a>
                </li>
            `;
        }
        
        // 다음 버튼
        html += `
            <li class="page-item ${this.currentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${this.currentPage + 1}">다음</a>
            </li>
        `;
        
        pagination.innerHTML = html;
        
        // 페이지 클릭 이벤트
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
        
        // 체크박스 상태 업데이트
        const checkbox = document.querySelector(`.item-checkbox[data-id="${id}"]`);
        if (checkbox) checkbox.checked = false;
    }
    
    showImageViewer(imageUrl, title, info, itemId = null) {
        // 이미지가 있는 항목들 필터링
        this.viewableItems = this.currentResults.filter(item => item.pageImageUrl);
        
        // 현재 인덱스 찾기
        if (itemId) {
            this.currentViewIndex = this.viewableItems.findIndex(item => item.id === itemId);
        }
        
        this.updateImageViewer(imageUrl, title, info);
        
        const modal = new bootstrap.Modal(document.getElementById('imageViewerModal'));
        modal.show();
    }
    
    updateImageViewer(imageUrl, title, info) {
        document.getElementById('imageViewerTitle').textContent = title;
        document.getElementById('imageViewerImg').src = imageUrl;
        document.getElementById('imageViewerInfo').textContent = info;
        document.getElementById('imageViewerDownload').href = imageUrl;
        
        // 인덱스 표시 업데이트
        const indexEl = document.getElementById('imageViewerIndex');
        if (this.viewableItems.length > 0 && this.currentViewIndex >= 0) {
            indexEl.textContent = `${this.currentViewIndex + 1} / ${this.viewableItems.length}`;
            indexEl.style.display = 'inline';
        } else {
            indexEl.style.display = 'none';
        }
        
        // 이전/다음 버튼 상태 업데이트
        const prevBtn = document.getElementById('prevImageBtn');
        const nextBtn = document.getElementById('nextImageBtn');
        
        prevBtn.disabled = this.currentViewIndex <= 0;
        nextBtn.disabled = this.currentViewIndex >= this.viewableItems.length - 1;
        
        prevBtn.style.opacity = prevBtn.disabled ? '0.3' : '1';
        nextBtn.style.opacity = nextBtn.disabled ? '0.3' : '1';
    }
    
    showPrevImage() {
        if (this.currentViewIndex > 0) {
            this.currentViewIndex--;
            const item = this.viewableItems[this.currentViewIndex];
            const title = `${item.buildingName} - ${item.floor}`;
            const info = `출처: ${item.source} | 발행: ${item.publishDate}`;
            this.updateImageViewer(item.pageImageUrl, title, info);
        }
    }
    
    showNextImage() {
        if (this.currentViewIndex < this.viewableItems.length - 1) {
            this.currentViewIndex++;
            const item = this.viewableItems[this.currentViewIndex];
            const title = `${item.buildingName} - ${item.floor}`;
            const info = `출처: ${item.source} | 발행: ${item.publishDate}`;
            this.updateImageViewer(item.pageImageUrl, title, info);
        }
    }
    
    showSingleMarkerMap(lat, lng, name) {
        document.getElementById('mapModalTitle').textContent = name;
        
        const modal = new bootstrap.Modal(document.getElementById('mapModal'));
        modal.show();
        
        // 모달이 표시된 후 지도 초기화
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
