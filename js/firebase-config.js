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
 * 마지막 업데이트 시간 가져오기
 */
async function getLastUpdateTime() {
    const allData = await loadMergedData();
    
    let latestTime = null;
    allData.forEach(item => {
        if (item.publishDate) {
            // publishDate 형식: "26.01" -> 2026-01
            const match = item.publishDate.match(/(\d{2})\.(\d{2})/);
            if (match) {
                const year = 2000 + parseInt(match[1]);
                const month = parseInt(match[2]);
                const date = new Date(year, month - 1, 1);
                if (!latestTime || date > latestTime) {
                    latestTime = date;
                }
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
    getLastUpdateTime
};

console.log('🔥 Firebase Service initialized');
