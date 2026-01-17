// Map Manager for Leasing Search App
// 카카오맵 기반 지도 기능

class MapManager {
    constructor() {
        this.map = null;
        this.markers = [];
        this.infoWindow = null;
        this.clusterer = null;
        this.mapContainerId = 'mapContainer';
        
        console.log('🗺️ MapManager initialized');
    }
    
    /**
     * 지도 초기화
     */
    initMap(lat = 37.5665, lng = 126.9780) {
        const container = document.getElementById(this.mapContainerId);
        if (!container) {
            console.error('Map container not found');
            return;
        }
        
        const options = {
            center: new kakao.maps.LatLng(lat, lng),
            level: 5
        };
        
        this.map = new kakao.maps.Map(container, options);
        
        // 지도 컨트롤 추가
        const zoomControl = new kakao.maps.ZoomControl();
        this.map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);
        
        const mapTypeControl = new kakao.maps.MapTypeControl();
        this.map.addControl(mapTypeControl, kakao.maps.ControlPosition.TOPRIGHT);
        
        console.log('✅ Map initialized');
        
        return this.map;
    }
    
    /**
     * 모든 마커 제거
     */
    clearMarkers() {
        this.markers.forEach(marker => {
            marker.setMap(null);
        });
        this.markers = [];
        
        if (this.clusterer) {
            this.clusterer.clear();
        }
        
        if (this.infoWindow) {
            this.infoWindow.close();
        }
    }
    
    /**
     * 단일 마커 표시
     */
    showSingleMarker(lat, lng, name) {
        // 지도 초기화
        this.initMap(lat, lng);
        this.clearMarkers();
        
        const position = new kakao.maps.LatLng(lat, lng);
        
        // 마커 생성
        const marker = new kakao.maps.Marker({
            position: position,
            map: this.map
        });
        
        this.markers.push(marker);
        
        // 인포윈도우 생성
        const infoContent = `
            <div style="padding: 10px; min-width: 150px;">
                <strong>${this.escapeHtml(name)}</strong>
            </div>
        `;
        
        this.infoWindow = new kakao.maps.InfoWindow({
            content: infoContent
        });
        
        // 마커 클릭 시 인포윈도우 표시
        kakao.maps.event.addListener(marker, 'click', () => {
            this.infoWindow.open(this.map, marker);
        });
        
        // 초기에 인포윈도우 열기
        this.infoWindow.open(this.map, marker);
        
        // 지도 중심 이동
        this.map.setCenter(position);
        this.map.setLevel(3);
    }
    
    /**
     * 여러 마커 표시
     */
    showMultipleMarkers(items) {
        if (!items || items.length === 0) {
            console.warn('No items to display on map');
            return;
        }
        
        // 첫 번째 아이템 위치로 지도 초기화
        const firstItem = items[0];
        this.initMap(firstItem.coordinates.lat, firstItem.coordinates.lng);
        this.clearMarkers();
        
        const bounds = new kakao.maps.LatLngBounds();
        
        items.forEach(item => {
            if (!item.coordinates) return;
            
            const position = new kakao.maps.LatLng(
                item.coordinates.lat, 
                item.coordinates.lng
            );
            
            // 마커 생성
            const marker = new kakao.maps.Marker({
                position: position,
                map: this.map
            });
            
            this.markers.push(marker);
            bounds.extend(position);
            
            // 인포윈도우 컨텐츠
            const infoContent = `
                <div style="padding: 10px; min-width: 200px;">
                    <strong>${this.escapeHtml(item.buildingName)}</strong>
                    <div style="font-size: 12px; color: #666; margin-top: 5px;">
                        ${item.floor ? `층: ${this.escapeHtml(item.floor)}` : ''}
                        ${item.exclusiveArea ? ` | 전용: ${item.exclusiveArea.toFixed(1)}평` : ''}
                    </div>
                    ${item.address ? `<div style="font-size: 11px; color: #888; margin-top: 3px;">${this.escapeHtml(item.address)}</div>` : ''}
                </div>
            `;
            
            // 마커 클릭 이벤트
            kakao.maps.event.addListener(marker, 'click', () => {
                if (this.infoWindow) {
                    this.infoWindow.close();
                }
                
                this.infoWindow = new kakao.maps.InfoWindow({
                    content: infoContent
                });
                
                this.infoWindow.open(this.map, marker);
            });
        });
        
        // 모든 마커가 보이도록 지도 범위 조정
        if (items.length > 1) {
            this.map.setBounds(bounds);
        } else {
            this.map.setLevel(4);
        }
    }
    
    /**
     * 주소로 좌표 검색
     */
    searchByAddress(address) {
        return new Promise((resolve, reject) => {
            const geocoder = new kakao.maps.services.Geocoder();
            
            geocoder.addressSearch(address, (result, status) => {
                if (status === kakao.maps.services.Status.OK) {
                    resolve({
                        lat: parseFloat(result[0].y),
                        lng: parseFloat(result[0].x)
                    });
                } else {
                    reject(new Error('Address not found'));
                }
            });
        });
    }
    
    /**
     * HTML 이스케이프
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 전역 MapManager 인스턴스
window.MapManager = new MapManager();
