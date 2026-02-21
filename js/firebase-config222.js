// Firebase Configuration for CRE Leasing Search
// Firebase Realtime Database 연동

const firebaseConfig = {
    databaseURL: "https://cre-unified-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 데이터 캐시
let buildingsCache = null;
let vacanciesCache = null;
let mergedDataCache = null;
let lastFetchTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5분 캐시

/**
 * 빌딩 데이터 로드
 */
async function loadBuildings() {
    if (buildingsCache && lastFetchTime && (Date.now() - lastFetchTime < CACHE_DURATION)) {
        console.log('📦 Using cached buildings data');
        return buildingsCache;
    }
    
    console.log('🔄 Loading buildings from Firebase...');
    const snapshot = await database.ref('buildings').once('value');
    const data = snapshot.val();
    
    if (data) {
        buildingsCache = data;
        console.log(`✅ Loaded ${Object.keys(data).length} buildings`);
    }
    
    return buildingsCache || {};
}

/**
 * 공실 데이터 로드
 */
async function loadVacancies() {
    if (vacanciesCache && lastFetchTime && (Date.now() - lastFetchTime < CACHE_DURATION)) {
        console.log('📦 Using cached vacancies data');
        return vacanciesCache;
    }
    
    console.log('🔄 Loading vacancies from Firebase...');
    const snapshot = await database.ref('vacancies').once('value');
    const data = snapshot.val();
    
    if (data) {
        vacanciesCache = data;
        console.log(`✅ Loaded vacancies for ${Object.keys(data).length} buildings`);
    }
    
    lastFetchTime = Date.now();
    return vacanciesCache || {};
}

/**
 * 빌딩과 공실 데이터 병합
 * 검색에 필요한 통합 데이터 생성
 */
async function loadMergedData() {
    if (mergedDataCache && lastFetchTime && (Date.now() - lastFetchTime < CACHE_DURATION)) {
        console.log('📦 Using cached merged data');
        return mergedDataCache;
    }
    
    console.log('🔄 Merging buildings and vacancies data...');
    
    const [buildings, vacancies] = await Promise.all([
        loadBuildings(),
        loadVacancies()
    ]);
    
    const mergedList = [];
    
    // vacancies를 순회하며 buildings 정보와 병합
    for (const [buildingId, vacancyData] of Object.entries(vacancies)) {
        if (buildingId === '_schema') continue;
        
        const buildingInfo = buildings[buildingId] || {};
        
        // 각 공실 항목 처리
        for (const [vacancyKey, vacancy] of Object.entries(vacancyData)) {
            if (typeof vacancy !== 'object' || !vacancy.buildingName) continue;
            
            mergedList.push({
                // 공실 정보
                id: `${buildingId}_${vacancyKey}`,
                buildingId: buildingId,
                vacancyKey: vacancyKey,
                buildingName: vacancy.buildingName || '',
                floor: vacancy.floor || '',
                exclusiveArea: vacancy.exclusiveArea || 0,
                rentArea: vacancy.rentArea || 0,
                source: vacancy.source || '',
                pageImageUrl: vacancy.pageImageUrl || '',
                pageNum: vacancy.pageNum || 1,
                documentId: vacancy.documentId || '',
                moveInDate: vacancy.moveInDate || '',
                publishDate: vacancy.publishDate || '',
                depositPy: vacancy.depositPy || '',
                rentPy: vacancy.rentPy || '',
                maintenancePy: vacancy.maintenancePy || '',
                
                // 빌딩 정보
                address: buildingInfo.address || '',
                nearbyStation: buildingInfo.nearbyStation || '',
                coordinates: buildingInfo.coordinates || null,
                region: buildingInfo.region || '',
                completionYear: buildingInfo.completionYear || '',
                totalFloors: buildingInfo.totalFloors || '',
                typicalFloorArea: buildingInfo.typicalFloorArea || ''
            });
        }
    }
    
    mergedDataCache = mergedList;
    console.log(`✅ Merged ${mergedList.length} vacancy items`);
    
    return mergedDataCache;
}

/**
 * 검색 실행
 */
async function searchVacancies(options = {}) {
    const {
        buildingName = '',
        district = '',
        station = '',
        walkingTime = 0,
        areaFrom = 0,
        areaTo = 0,
        source = ''
    } = options;
    
    const allData = await loadMergedData();
    
    let results = allData.filter(item => {
        // 빌딩명 검색
        if (buildingName) {
            const searchTerm = buildingName.toLowerCase();
            const name = (item.buildingName || '').toLowerCase();
            if (!name.includes(searchTerm)) return false;
        }
        
        // 지역명 검색 (주소)
        if (district) {
            const searchTerm = district.toLowerCase();
            const address = (item.address || '').toLowerCase();
            if (!address.includes(searchTerm)) return false;
        }
        
        // 역명 검색
        if (station) {
            const searchTerm = station.toLowerCase();
            const nearbyStation = (item.nearbyStation || '').toLowerCase();
            if (!nearbyStation.includes(searchTerm)) return false;
        }
        
        // 면적 범위 검색 (전용면적 기준)
        if (areaFrom > 0 && item.exclusiveArea < areaFrom) return false;
        if (areaTo > 0 && item.exclusiveArea > areaTo) return false;
        
        // 출처 검색
        if (source) {
            const searchTerm = source.toLowerCase();
            const itemSource = (item.source || '').toLowerCase();
            if (!itemSource.includes(searchTerm)) return false;
        }
        
        return true;
    });
    
    console.log(`🔍 Search results: ${results.length} items`);
    return results;
}

/**
 * 빌딩명 자동완성 데이터 가져오기
 */
async function getBuildingNameSuggestions(query) {
    if (!query || query.length < 1) return [];
    
    const allData = await loadMergedData();
    const searchTerm = query.toLowerCase();
    
    // 빌딩명 중복 제거
    const uniqueBuildings = new Map();
    allData.forEach(item => {
        if (item.buildingName && item.buildingName.toLowerCase().includes(searchTerm)) {
            if (!uniqueBuildings.has(item.buildingName)) {
                uniqueBuildings.set(item.buildingName, {
                    name: item.buildingName,
                    address: item.address,
                    buildingId: item.buildingId
                });
            }
        }
    });
    
    return Array.from(uniqueBuildings.values()).slice(0, 10);
}

/**
 * 지역명 자동완성 - 구/동 단위
 */
async function getDistrictSuggestions(query) {
    if (!query || query.length < 1) return [];
    
    const allData = await loadMergedData();
    const searchTerm = query.toLowerCase();
    
    const districts = new Set();
    allData.forEach(item => {
        if (item.address) {
            const addressLower = item.address.toLowerCase();
            
            // 구 단위 추출
            const guMatch = item.address.match(/([가-힣]+구)/);
            if (guMatch && guMatch[1].toLowerCase().includes(searchTerm)) {
                districts.add(guMatch[1]);
            }
            
            // 동 단위 추출
            const dongMatch = item.address.match(/([가-힣]+동)/);
            if (dongMatch && dongMatch[1].toLowerCase().includes(searchTerm)) {
                districts.add(dongMatch[1]);
            }
            
            // 로/길 단위 추출
            const roadMatch = item.address.match(/([가-힣0-9]+(?:로|길))/);
            if (roadMatch && roadMatch[1].toLowerCase().includes(searchTerm)) {
                districts.add(roadMatch[1]);
            }
        }
    });
    
    return Array.from(districts).sort().slice(0, 10);
}

/**
 * 역명 자동완성
 */
async function getStationSuggestions(query) {
    if (!query || query.length < 1) return [];
    
    const allData = await loadMergedData();
    const searchTerm = query.toLowerCase();
    
    const stations = new Set();
    allData.forEach(item => {
        if (item.nearbyStation && item.nearbyStation.toLowerCase().includes(searchTerm)) {
            // 역명 추출 (여러 역이 있을 수 있음)
            const stationMatches = item.nearbyStation.match(/[가-힣A-Za-z0-9]+역/g);
            if (stationMatches) {
                stationMatches.forEach(s => stations.add(s));
            }
        }
    });
    
    return Array.from(stations).slice(0, 10);
}

/**
 * 출처(회사) 목록 가져오기
 */
async function getSourceList() {
    const allData = await loadMergedData();
    const sources = new Set();
    
    allData.forEach(item => {
        if (item.source) {
            sources.add(item.source);
        }
    });
    
    return Array.from(sources).sort();
}

/**
 * 같은 documentId를 가진 모든 페이지 가져오기
 */
async function getDocumentPages(documentId) {
    if (!documentId) return [];
    
    const allData = await loadMergedData();
    
    const pages = allData
        .filter(item => item.documentId === documentId && item.pageImageUrl)
        .sort((a, b) => (a.pageNum || 0) - (b.pageNum || 0));
    
    // 중복 pageNum 제거
    const uniquePages = [];
    const seenPageNums = new Set();
    pages.forEach(p => {
        if (!seenPageNums.has(p.pageNum)) {
            seenPageNums.add(p.pageNum);
            uniquePages.push(p);
        }
    });
    
    console.log(`📄 Document ${documentId}: ${uniquePages.length} pages found`);
    return uniquePages;
}

/**
 * 같은 회사(source)와 빌딩(buildingName)의 과월호 목록 가져오기
 * @param {string} source - 출처 (회사명)
 * @param {string} buildingName - 빌딩명
 * @returns {Array} 발행일순 정렬된 과월호 목록
 */
async function getArchivesBySourceAndBuilding(source, buildingName) {
    if (!source || !buildingName) return [];
    
    const allData = await loadMergedData();
    
    // 같은 회사 + 같은 빌딩 필터링
    const archives = allData.filter(item => 
        item.source === source && 
        item.buildingName === buildingName &&
        item.pageImageUrl
    );
    
    // publishDate 기준 그룹핑 (중복 제거)
    const uniqueArchives = new Map();
    archives.forEach(item => {
        const key = `${item.publishDate}_${item.documentId}`;
        if (!uniqueArchives.has(key)) {
            uniqueArchives.set(key, item);
        }
    });
    
    // 발행일 기준 내림차순 정렬 (최신순)
    const sorted = Array.from(uniqueArchives.values()).sort((a, b) => {
        const dateA = parsePublishDate(a.publishDate);
        const dateB = parsePublishDate(b.publishDate);
        return dateB - dateA;
    });
    
    console.log(`📚 Archives for ${source}/${buildingName}: ${sorted.length} issues found`);
    return sorted;
}

/**
 * 같은 빌딩의 다른 회사 임대안내문 목록 가져오기
 * @param {string} buildingName - 빌딩명
 * @param {string} excludeSource - 제외할 회사 (현재 보고 있는 회사)
 * @returns {Array} 회사별 최신 임대안내문 목록
 */
async function getOtherSourcesForBuilding(buildingName, excludeSource = '') {
    if (!buildingName) return [];
    
    const allData = await loadMergedData();
    
    // 같은 빌딩의 다른 회사 필터링
    const otherSources = allData.filter(item => 
        item.buildingName === buildingName && 
        item.source !== excludeSource &&
        item.pageImageUrl
    );
    
    // 회사별로 최신 자료만 선택
    const latestBySource = new Map();
    otherSources.forEach(item => {
        const existing = latestBySource.get(item.source);
        if (!existing) {
            latestBySource.set(item.source, item);
        } else {
            const existingDate = parsePublishDate(existing.publishDate);
            const itemDate = parsePublishDate(item.publishDate);
            if (itemDate > existingDate) {
                latestBySource.set(item.source, item);
            }
        }
    });
    
    // 발행일 기준 내림차순 정렬
    const sorted = Array.from(latestBySource.values()).sort((a, b) => {
        const dateA = parsePublishDate(a.publishDate);
        const dateB = parsePublishDate(b.publishDate);
        return dateB - dateA;
    });
    
    console.log(`🏢 Other sources for ${buildingName}: ${sorted.length} companies found`);
    return sorted;
}

/**
 * 같은 빌딩명의 모든 자료 가져오기 (검색 결과 내 동일 빌딩)
 * @param {string} buildingName - 빌딩명
 * @returns {Array} 발행일순 정렬된 모든 자료
 */
async function getAllForBuilding(buildingName) {
    if (!buildingName) return [];
    
    const allData = await loadMergedData();
    
    const items = allData.filter(item => 
        item.buildingName === buildingName && 
        item.pageImageUrl
    );
    
    // 발행일 기준 내림차순 정렬
    const sorted = items.sort((a, b) => {
        const dateA = parsePublishDate(a.publishDate);
        const dateB = parsePublishDate(b.publishDate);
        return dateB - dateA;
    });
    
    return sorted;
}

/**
 * publishDate 파싱 헬퍼 함수
 * @param {string} publishDate - "26.01" 또는 "2026.01" 형식
 * @returns {Date} 날짜 객체
 */
function parsePublishDate(publishDate) {
    if (!publishDate) return new Date(0);
    
    const match = publishDate.match(/(\d{2,4})\.(\d{2})/);
    if (!match) return new Date(0);
    
    let year = parseInt(match[1]);
    const month = parseInt(match[2]);
    
    // 2자리 연도면 2000년대로 변환
    if (year < 100) {
        year = 2000 + year;
    }
    
    return new Date(year, month - 1, 1);
}

/**
 * 마지막 업데이트 시간 가져오기
 */
async function getLastUpdateTime() {
    const allData = await loadMergedData();
    
    let latestTime = null;
    allData.forEach(item => {
        if (item.publishDate) {
            const date = parsePublishDate(item.publishDate);
            if (!latestTime || date > latestTime) {
                latestTime = date;
            }
        }
    });
    
    if (latestTime) {
        return `${latestTime.getFullYear()}년 ${latestTime.getMonth() + 1}월`;
    }
    
    return '정보 없음';
}

// 전역 export
window.FirebaseService = {
    loadBuildings,
    loadVacancies,
    loadMergedData,
    searchVacancies,
    getBuildingNameSuggestions,
    getDistrictSuggestions,
    getStationSuggestions,
    getSourceList,
    getLastUpdateTime,
    getDocumentPages,
    getArchivesBySourceAndBuilding,
    getOtherSourcesForBuilding,
    getAllForBuilding,
    parsePublishDate
};

console.log('🔥 Firebase Service initialized');
