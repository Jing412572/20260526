let rainData = null;
let cwaData = null;
let cwaDict = {}; // 用來存放氣象署 (CWA) 測站經緯度的字典

const apiUrl = 'https://wic.gov.taipei/OpenData/API/Rain/Get?stationNo=&loginId=open_rain&dataKey=85452C1D';
const cwaUrl = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0002-001?Authorization=rdec-key-123-45678-011121314';

// 使用公共的 CORS 代理伺服器 (CORS Proxy)。
// 代理伺服器會幫你去台北市政府的 API 拿取資料（伺服器對伺服器不會有 CORS 限制），
// 然後再加上 Access-Control-Allow-Origin: * 的標頭，把資料回傳給你的瀏覽器。
const proxyUrl = 'https://corsproxy.io/?';

// 台北市主要測站經緯度座標對照表 (用於地圖定位)
const stationCoords = {
  "湖田國小": { lat: 25.1528, lon: 121.5323 },
  "大屯國小": { lat: 25.1741, lon: 121.4925 },
  "桃源國中": { lat: 25.1397, lon: 121.4914 },
  "北投國小": { lat: 25.1321, lon: 121.5005 },
  "陽明高中": { lat: 25.0945, lon: 121.5148 },
  "太平國小": { lat: 25.0610, lon: 121.5111 },
  "民生國中": { lat: 25.0602, lon: 121.5606 },
  "中正國中": { lat: 25.0336, lon: 121.5201 },
  "三興國小": { lat: 25.0303, lon: 121.5583 },
  "格致國中": { lat: 25.1362, lon: 121.5387 },
  "平等國小": { lat: 25.1278, lon: 121.5714 },
  "至善國中": { lat: 25.1014, lon: 121.5489 },
  "碧湖國小": { lat: 25.0811, lon: 121.5878 },
  "東湖國小": { lat: 25.0689, lon: 121.6169 },
  "瑠公國中": { lat: 25.0372, lon: 121.5847 },
  "舊莊國小": { lat: 25.0402, lon: 121.6186 },
  "博嘉國小": { lat: 25.0000, lon: 121.5886 },
  "北政國中": { lat: 24.9861, lon: 121.5786 },
  "長安國小": { lat: 25.0489, lon: 121.5283 },
  "萬華國中": { lat: 25.0278, lon: 121.4986 },
  "台灣大學(新)": { lat: 25.0175, lon: 121.5397 },
  "雙園": { lat: 25.0232, lon: 121.4925 },
  "中洲": { lat: 25.1235, lon: 121.4608 }
};

let myMap;
let canvas;
let sysError = ""; // 儲存系統錯誤訊息
let searchInput; // 搜尋框物件
let districtSelect; // 行政區下拉選單
let knownDistricts = new Set(); // 記錄已加入選單的行政區
let showNameCheckbox; // 顯示站名的選項
let clickableStations = []; // 儲存側邊欄文字的點擊區域與對應座標
let mapAutoZoomed = false; // 紀錄是否已經自動縮放過地圖
let targetScrollIndex = 0; // 側邊欄清單的「目標」捲動索引
let currentScrollIndex = 0; // 側邊欄清單的「當前平滑」捲動索引
let listHoveredStation = null; // 紀錄左側清單被懸停的測站
let drops = []; // 儲存右上角天氣特效的雨滴
let lastUpdateTime = 0; // 紀錄上次更新時間
const UPDATE_INTERVAL = 5 * 60 * 1000; // 5 分鐘自動更新一次 (毫秒)

// 地圖預設設定 (以台北市為中心)
const options = {
  lat: 25.0330,
  lng: 121.5654,
  zoom: 11,
};

function setup() {
  try {
    // 1. 手動建立一個 div 來放置 Leaflet 地圖，並將其置於底層
    let mapDiv = createDiv();
    mapDiv.id('mapContainer');
    mapDiv.style('position', 'absolute');
    mapDiv.style('top', '0px');
    mapDiv.style('left', '0px');
    mapDiv.style('width', '100vw');
    mapDiv.style('height', '100vh');
    mapDiv.style('z-index', '1'); // 確保地圖在最底層
    
    // 2. 初始化原生 Leaflet 地圖
    myMap = L.map('mapContainer').setView([options.lat, options.lng], options.zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(myMap);

    // 設定全螢幕畫布
    canvas = createCanvas(windowWidth, windowHeight);
    
    canvas.style('position', 'absolute');
    canvas.style('top', '0px');
    canvas.style('left', '0px');
    canvas.style('z-index', '10'); // p5 畫布在頂層
    canvas.style('pointer-events', 'none'); // 讓滑鼠點擊穿透到地圖

    textFont('sans-serif');

    // 建立搜尋輸入框
    searchInput = createInput('');
    searchInput.position(20, 185); // 調整至時間與圖例的下方
    searchInput.size(200, 25);
    searchInput.attribute('placeholder', '🔍 輸入站名搜尋...');
    searchInput.style('z-index', '20'); // 確保搜尋框在地圖和畫布上層，能順利被點擊
    
    // 建立行政區下拉選單
    districtSelect = createSelect();
    districtSelect.position(20, 220); // 放置在搜尋框下方
    districtSelect.size(200, 25);
    districtSelect.style('z-index', '20');
    districtSelect.option('全部行政區');

    // 建立「顯示站名」的選項 (Checkbox)
    showNameCheckbox = createCheckbox(' 在地圖顯示站名', false);
    showNameCheckbox.position(240, 185); // 放置在搜尋框右側
    showNameCheckbox.style('z-index', '20');
    showNameCheckbox.style('color', '#333');
    showNameCheckbox.style('font-size', '15px');

    // 初始化右上角天氣特效的雨滴
    for (let i = 0; i < 30; i++) {
      drops.push({ x: random(-40, 40), y: random(-20, 60), speed: random(5, 10), len: random(10, 20) });
    }

    // 初次抓取 API 資料
    fetchAPIData();
  } catch (err) {
    sysError = err.message || err.toString();
    console.error("初始化錯誤:", err);
  }
}

// 將抓取資料的邏輯獨立出來，方便定時呼叫
function fetchAPIData() {
  loadJSON(proxyUrl + encodeURIComponent(apiUrl), gotData, gotError);
  loadJSON(proxyUrl + encodeURIComponent(cwaUrl), gotCwaData, gotError);
  lastUpdateTime = millis();
}

function gotData(data) {
  rainData = data;
}

function gotCwaData(data) {
  cwaData = data;
  if (data && data.records) {
    // 相容不同版本的氣象署 API 結構
    let stations = data.records.Station || data.records.location || [];
    for (let i = 0; i < stations.length; i++) {
      let st = stations[i];
      let name = st.StationName || st.locationName;
      let lat, lon;
      let townName = "";
      
      if (st.GeoInfo && st.GeoInfo.Coordinates) {
        // 尋找 WGS84 座標（真實經緯度系統）
        let targetCoord = st.GeoInfo.Coordinates.find(c => c.CoordinateName === 'WGS84') || st.GeoInfo.Coordinates[0];
        if (targetCoord) {
          lat = targetCoord.StationLatitude;
          lon = targetCoord.StationLongitude;
        }
        if (st.GeoInfo.TownName) townName = st.GeoInfo.TownName;
      } else if (st.lat && st.lon) {
        lat = st.lat;
        lon = st.lon;
        if (st.TownName) townName = st.TownName;
      }
      
      if (name && lat !== undefined && lon !== undefined) {
        // 為了確保「臺/台」等異體字比對成功，存入兩種版本
        cwaDict[name] = { lat: parseFloat(lat), lon: parseFloat(lon), town: townName };
        cwaDict[name.replace(/臺/g, '台')] = { lat: parseFloat(lat), lon: parseFloat(lon), town: townName };
      }
    }
  }
}

function gotError(error) {
  console.error("資料獲取失敗:", error);
  rainData = { error: "無法取得資料，請檢查網路狀態或代理伺服器設定。" };
}

function draw() {
  // 動態切換事件穿透：讓滑鼠在左側時可以點擊畫布上的輸入框，在右側時能拖曳地圖
  if (mouseX > 0 && mouseX < 480) {
    canvas.style('pointer-events', 'auto');
  } else {
    canvas.style('pointer-events', 'none');
  }

  try {
    // 清除 p5 畫布背景，使其保持透明，才能看到下方的地圖
    clear();
    
    // 如果遇到致命錯誤，顯示紅字警告並停止渲染剩餘內容
    if (sysError) {
      background(255, 200, 200);
      fill(255, 0, 0);
      textSize(20);
      text("系統發生錯誤: " + sysError, 20, 50);
      return;
    }

    // 畫一層半透明的白底當作「左側資訊側邊欄」，右側完全留給地圖
    fill(255, 255, 255, 210);
    noStroke();
    rect(0, 0, 480, height);
    
    fill(30);
    
    // 確認兩邊的 API 資料是否都已經回傳
    if (rainData && cwaData) {
      if (rainData.error) {
        textSize(20);
        fill(255, 0, 0);
        text(rainData.error, 20, 50);
        return;
      }
      
      let dataList = rainData.data || rainData.result || rainData; 

      let y = 30;
      textSize(26);
      fill(0, 102, 153);
      text("台北市即時雨量資料 (OpenData)", 20, y);
      y += 35; 
      
      // 顯示資料產生時間
      let obsTime = rainData.recTime || rainData.time || rainData.obsTime;
      if (!obsTime && Array.isArray(dataList) && dataList.length > 0) {
        obsTime = dataList[0].recTime || dataList[0].time || "未知時間";
      }
      textSize(16);
      fill(80);
      text("資料產生時間: " + (obsTime || "取得中..."), 20, y);
      y += 35;

      // 繪製六個級距的雨量顏色圖例 (Legend)
      textSize(15);
      fill(30);
      noStroke();
      text("降雨量顏色區分：", 20, y);
      y += 25;

      let categories = [
        { label: "0 mm", c: getRainColor(0) },
        { label: "≤ 2 mm", c: getRainColor(1) },
        { label: "2-10 mm", c: getRainColor(5) },
        { label: "10-20 mm", c: getRainColor(15) },
        { label: "20-40 mm", c: getRainColor(25) },
        { label: "> 40 mm", c: getRainColor(45) }
      ];

      let startX = 20;
      for (let i = 0; i < categories.length; i++) {
        if (i === 3) {
          y += 25; // 換行
          startX = 20;
        }
        fill(categories[i].c);
        stroke(255);
        strokeWeight(2);
        circle(startX + 10, y - 5, 14);
        noStroke();
        fill(30);
        text(categories[i].label, startX + 25, y);
        startX += 140;
      }
      y += 90; // 為搜尋框、下拉選單與列表留出空間
      
      textSize(16);
      fill(30);
      
      if (Array.isArray(dataList)) {
        // 找出最大雨量來決定右上角天氣特效
        let maxRain = 0;
        for (let i = 0; i < dataList.length; i++) {
          let r = dataList[i].rain10mins || dataList[i].Rain10mins || dataList[i].rain10 || 0;
          if (r > maxRain) maxRain = r;
        }
        drawWeatherEffect(maxRain);

        // 每次重新繪製前，清空可點擊區域陣列
        clickableStations = [];
        listHoveredStation = null;

        // 取得搜尋關鍵字並轉為小寫，去除前後空白
        let searchTerm = searchInput.value().trim().toLowerCase();
        let selectedDistrict = districtSelect.value();
        
        // 過濾出符合條件的測站 (文字與下拉選單雙重過濾)
        let filteredData = dataList.filter(station => {
          let name = station.stationName || station.StationName || station.name || "未知測站";
          let normalizedName = name.replace(/臺/g, '台');
          
          // 提取行政區，若市府 API 缺乏，自動去氣象署 (CWA) 字典找
          let town = station.town || station.Town || station.district || station.District;
          if (!town) {
            let coords = cwaDict[name] || cwaDict[normalizedName];
            town = (coords && coords.town) ? coords.town : "其他/未知";
          }
          
          // 若出現新的行政區，動態加入到下拉選單中
          if (!knownDistricts.has(town)) {
            knownDistricts.add(town);
            districtSelect.option(town);
          }
          
          let matchSearch = name.toLowerCase().includes(searchTerm);
          let matchDistrict = (selectedDistrict === '全部行政區' || selectedDistrict === town);
          
          return matchSearch && matchDistrict;
        });

        // 將過濾後的資料依據「10分鐘雨量」由大到小排序，若雨量相同則依名稱排序
        filteredData.sort((a, b) => {
          let rainA = a.rain10mins || a.Rain10mins || a.rain10 || 0;
          let rainB = b.rain10mins || b.Rain10mins || b.rain10 || 0;
          if (rainB !== rainA) return rainB - rainA;
          let nameA = a.stationName || a.StationName || a.name || "";
          let nameB = b.stationName || b.StationName || b.name || "";
          return nameA.localeCompare(nameB, 'zh-Hant');
        });

        // 計算畫面高度可以容納的資料筆數，避免超出下邊界
        let maxLines = floor((height - y - 20) / 30);
        
        // 計算最大可捲動的範圍，並限制捲動索引不要超出邊界
        let maxScroll = max(0, filteredData.length - maxLines);
        targetScrollIndex = constrain(targetScrollIndex, 0, maxScroll);
        currentScrollIndex = lerp(currentScrollIndex, targetScrollIndex, 0.15); // 使用 lerp 產生平滑過渡動畫
        
        let textStartY = y; // 記住清單開始的 Y 座標
        
        let hoveredStation = null; // 儲存滑鼠目前懸停的測站資訊
        let rainingCoords = []; // 用來收集有下雨測站的經緯度
        
        let startIndex = floor(currentScrollIndex);
        // 迴圈改為遍歷 "過濾後" 的測站，讓文字列表和地圖上的點能同步更新
        for (let i = 0; i < filteredData.length; i++) {
          let station = filteredData[i];
          
          // 嘗試提取欄位名稱，相容多種常見 JSON 的命名方式
          let stationName = station.stationName || station.StationName || station.name || "未知測站";
          let normalizedName = stationName.replace(/臺/g, '台'); // 統一轉換名稱來對照
          let rain10 = station.rain10mins || station.Rain10mins || station.rain10 || 0;
          let rain60 = station.rain60mins || station.Rain60mins || station.rain1hr || 0;
          
          // 取得經緯度，優先從手動字典或氣象署的資料字典中根據站名查找
          let manualCoords = stationCoords[stationName] || stationCoords[normalizedName];
          let coords = cwaDict[stationName] || cwaDict[normalizedName];
          let lat = manualCoords?.lat || coords?.lat || station.lat || station.latitude || station.Lat || station.Latitude;
          let lon = manualCoords?.lon || coords?.lon || station.lon || station.longitude || station.lng || station.Lon || station.Longitude;

          // 如果是第一次渲染，且該測站有下雨，就將座標收集起來
          if (!mapAutoZoomed && rain10 > 0 && lat && lon) {
            rainingCoords.push([lat, lon]);
          }

          // 判斷是否在可見的捲動範圍內 (多畫一行以確保平滑捲動時上下邊緣不留白)
          if (i >= startIndex && i <= startIndex + maxLines + 1) {
            
            // 限制渲染區域 (Clip)，避免文字在平滑滑動時溢出蓋到上方標題與搜尋框
            drawingContext.save();
            drawingContext.beginPath();
            drawingContext.rect(0, textStartY - 25, 480, height - textStartY + 25);
            drawingContext.clip();

            let info = (stationName === "未知測站" && rain10 === 0) ? JSON.stringify(station) 
                       : `📍 測站: ${stationName}   |   10分鐘雨量: ${rain10} mm   |   1小時雨量: ${rain60} mm`;
            
            // 計算這筆資料在畫面上的相對 Y 座標
            let displayIndex = i - currentScrollIndex;
            let currentY = textStartY + displayIndex * 30;
            let itemY = currentY - 20;
            let itemH = 30;
            
            // 判斷滑鼠是否懸停在文字上，加上邊界防護，避免在隱藏區域觸發
            let isHovering = mouseX > 20 && mouseX < 460 && mouseY > itemY && mouseY < itemY + itemH && mouseY > textStartY - 25;
            if (isHovering) {
              fill(0, 102, 153); // 懸停時顯示為藍色
              listHoveredStation = stationName; // 紀錄懸停的測站，連動右側地圖
            } else {
              fill(30);
            }
            
            noStroke();
            text(info, 20, currentY);
            
            // 將該列的點擊範圍與座標存入陣列，供 mousePressed 判斷
            if (lat && lon && itemY > textStartY - 30) {
              clickableStations.push({ lat: lat, lon: lon, x: 20, y: itemY, w: 440, h: itemH });
            }
            
            drawingContext.restore(); // 釋放裁切範圍，以免影響右側地圖畫點
          }

          if (lat && lon && myMap) {
            // 使用 Leaflet 提供的 latLngToContainerPoint 將經緯度轉換為網頁像素座標
            let pos = myMap.latLngToContainerPoint([lat, lon]);
            
            let rSize = 14 + (rain10 * 1.5); // 基礎大小，有雨則放大
            
            // 針對大雨 (>=10mm) 加入呼吸燈縮放特效
            if (rain10 >= 10) {
              rSize += sin(frameCount * 0.1) * 4; 
            }
            
            // 取得對應的六階段雨量分類顏色
            let dotColor = getRainColor(rain10); 

            // 檢查滑鼠是否懸停在圓點上，或在左側面板被指到
            let d = dist(mouseX, mouseY, pos.x, pos.y);
            let isHovered = (d < rSize / 2) || (listHoveredStation === stationName);

            if (isHovered) {
              hoveredStation = { name: stationName, rain10: rain10, rain60: rain60 };
              dotColor.setAlpha(255); // 懸停時高亮不透明
              fill(dotColor);
              stroke(255);
              strokeWeight(3);
              rSize += 12; // 懸停時明顯放大圓點
            } else {
              fill(dotColor);
              stroke(255);
              strokeWeight(2);
            }
            
            // 繪製測站圓點
            circle(pos.x, pos.y, rSize);

            // 如果勾選了顯示站名選項，就在地圖上的圓點旁直接畫出文字
            if (showNameCheckbox.checked() && !isHovered) {
              push();
              fill(20);
              noStroke();
              drawingContext.shadowColor = 'rgba(255, 255, 255, 0.8)'; // 白色光暈讓字不被地圖吃掉
              drawingContext.shadowBlur = 4;
              textAlign(LEFT, CENTER);
              textSize(13);
              text(stationName, pos.x + rSize / 2 + 6, pos.y);
              pop();
            }
          }
        }
        
        // 在迴圈外畫出捲軸指示器
        if (maxScroll > 0) {
          let trackH = maxLines * 30;
          let thumbH = max(20, (maxLines / filteredData.length) * trackH);
          let thumbY = textStartY - 20 + (currentScrollIndex / maxScroll) * (trackH - thumbH);
          
          fill(200, 200, 200, 150);
          noStroke();
          rect(465, textStartY - 20, 6, trackH, 3); // 捲軸軌道
          fill(120, 120, 120, 200);
          rect(465, thumbY, 6, thumbH, 3); // 捲軸把手
        }

        // 如果是第一次載入資料，且有收集到正在下雨的測站，自動平滑縮放地圖
        if (!mapAutoZoomed) {
          if (rainingCoords.length > 0 && myMap) {
            let bounds = L.latLngBounds(rainingCoords);
            // 使用 paddingTopLeft 確保鏡頭會避開左側 480px 的資訊側邊欄
            // 使用 maxZoom: 14 確保如果只有一個測站下雨時，鏡頭不會縮放得太近
            myMap.flyToBounds(bounds, { 
              paddingTopLeft: [520, 50], 
              paddingBottomRight: [50, 50], 
              maxZoom: 14 
            });
          }
          mapAutoZoomed = true; // 標記為已縮放，之後 `draw` 迴圈不再重複執行
        }
        
        // 在畫完所有圓點後，最後繪製 Tooltip 懸浮提示框，避免被其他圓點遮擋
        if (hoveredStation) {
          push(); // 儲存當前繪圖設定
          let boxW = 200;
          let boxH = 80;
          let boxX = mouseX + 15;
          let boxY = mouseY + 15;
          
          // 防止 Tooltip 超出視窗右側或下邊界
          if (boxX + boxW > width) boxX = mouseX - boxW - 15;
          if (boxY + boxH > height) boxY = mouseY - boxH - 15;
          
          // 畫出帶圓角的資訊背板
          fill(255, 255, 255, 240);
          stroke(150);
          strokeWeight(1);
          rect(boxX, boxY, boxW, boxH, 8); 
          
          // 印上文字資訊
          fill(0);
          noStroke();
          textAlign(LEFT, TOP);
          textSize(16);
          text(`📍 測站: ${hoveredStation.name}`, boxX + 12, boxY + 12);
          
          textSize(14);
          fill(50);
          text(`10分鐘雨量: ${hoveredStation.rain10} mm`, boxX + 12, boxY + 36);
          text(`1小時雨量: ${hoveredStation.rain60} mm`, boxX + 12, boxY + 56);
          pop(); // 恢復之前的繪圖設定
        }
      } else {
        // 若回傳的不是陣列，就將整包 JSON 轉換為格式化字串顯示於畫布上
        let jsonString = JSON.stringify(rainData, null, 2);
        let lines = jsonString.split('\n');
        for (let i = 0; i < min(lines.length, floor((height - y - 20) / 20)); i++) {
          text(lines[i], 20, y);
          y += 20;
        }
      }
    } else {
      // 等待 API 回傳前的載入畫面
      textSize(22);
      fill(100);
      text("⏳ 正在透過代理伺服器載入資料中...", 20, 50);
    }

    // 檢查是否需要定時自動更新資料
    if (millis() - lastUpdateTime > UPDATE_INTERVAL) {
      fetchAPIData();
    }
  } catch (err) {
    // 捕捉 draw 迴圈中的例外狀況，避免畫面徹底白屏
    background(255, 200, 200);
    fill(255, 0, 0);
    textSize(20);
    text("渲染發生錯誤: " + err.message, 20, 50);
  }
}

// 依據雨量取得六個不同級距的顏色
function getRainColor(rain) {
  if (rain === 0) return color(135, 206, 235, 200); // 天空色 Sky Blue
  if (rain <= 2) return color(0, 255, 0, 200);      // 綠色
  if (rain <= 10) return color(255, 255, 0, 200);   // 黃色
  if (rain <= 20) return color(255, 165, 0, 200);   // 橘色
  if (rain <= 40) return color(255, 50, 50, 200);   // 紅色
  return color(128, 0, 128, 200);                   // 紫色
}

// 繪製右上角天氣動態特效
function drawWeatherEffect(maxRain) {
  push();
  let effectX = width - 100;
  let effectY = 100;

  if (maxRain === 0) {
    // 繪製大太陽
    translate(effectX, effectY);
    rotate(frameCount * 0.02);
    noStroke();
    fill(255, 223, 0, 220); // 太陽黃
    circle(0, 0, 50);
    stroke(255, 223, 0, 220);
    strokeWeight(4);
    for(let i = 0; i < 8; i++){
      rotate(TWO_PI / 8);
      line(35, 0, 50, 0);
    }
  } else {
    // 繪製下雨 (烏雲 + 落下雨滴)
    noStroke();
    fill(180, 180, 180, 220); // 烏雲
    ellipse(effectX, effectY - 15, 80, 40);
    ellipse(effectX - 25, effectY - 5, 60, 40);
    ellipse(effectX + 25, effectY - 5, 60, 40);

    stroke(100, 150, 255, 200);
    strokeWeight(2);
    for(let i = 0; i < drops.length; i++) {
      let d = drops[i];
      line(effectX + d.x, effectY + d.y, effectX + d.x - d.speed/3, effectY + d.y + d.len);
      d.y += d.speed;
      d.x -= d.speed/3;
      if (d.y > 80) { // 重置雨滴高度
        d.y = random(-10, 10);
        d.x = random(-40, 40);
      }
    }
  }
  pop();
}

// 監聽畫布的滑鼠點擊事件
function mousePressed() {
  // 確認點擊發生在左側側邊欄範圍內
  if (mouseX > 0 && mouseX < 480) {
    // 巡覽所有可點擊的測站區域
    for (let i = 0; i < clickableStations.length; i++) {
      let btn = clickableStations[i];
      if (mouseX >= btn.x && mouseX <= btn.x + btn.w && mouseY >= btn.y && mouseY <= btn.y + btn.h) {
        if (btn.lat && btn.lon && myMap) {
          // 點擊後，使用 Leaflet 的 flyTo 平滑移動地圖中心並設定縮放層級至 15
          myMap.flyTo([btn.lat, btn.lon], 15);
        }
        break; // 已經找到對應的點擊目標，跳出迴圈
      }
    }
  }
}

// 監聽滑鼠滾輪事件，用來捲動左側清單
function mouseWheel(event) {
  // 只要游標在左側側邊欄範圍內，就可以捲動
  if (mouseX > 0 && mouseX < 480) {
    // 根據滾輪方向決定捲動行數 (一次推動 1.5 行的距離，讓捲動體驗更敏捷順暢)
    targetScrollIndex += (event.delta > 0) ? 1.5 : -1.5;
    return false; // 回傳 false 防止網頁本身跟著捲動
  }
}

function windowResized() {
  // 當視窗大小改變時，重設畫布以維持全螢幕狀態
  resizeCanvas(windowWidth, windowHeight);
  if (myMap) {
    myMap.invalidateSize(); // 通知 Leaflet 重新計算畫面尺寸
  }
}