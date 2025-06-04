import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { Chart } from 'chart.js/auto';
import { geoMercator, geoPath } from 'd3-geo';
import { scaleQuantize } from '@visx/scale';
import * as d3 from 'd3';

const App = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [geoJsonData, setGeoJsonData] = useState(null);

  const [xAxisColumn, setXAxisColumn] = useState('');
    const [yAxisColumn, setYAxisColumn] = useState('');
  const [AxisColumnFilter, setAxisColumnFilter] = useState([]);


  const [selectedIsoCodes, setSelectedIsoCodes] = useState([]);
  const [yearRange, setYearRange] = useState([null, null]);
  const [chartType, setChartType] = useState('line');
  const [barAggregation, setBarAggregation] = useState("average");

  const chartRef = useRef(null);
  const geoUrl = "./custom.geo.json";
  const [mapData, setMapData] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const results = await new Promise((resolve, reject) => {
        Papa.parse('./output.csv', {
          download: true,
          header: true,
          dynamicTyping: true,
          complete: (results) => resolve(results),
          error: (error) => reject(error)
        });
      });
      setLoading(false);
      return results.data;
    };

    fetchData().then(data => setData(data));

    fetch(geoUrl)
      .then(response => response.text())
      .then(text => {
        const cleanedText = text.replace(/^[)\]\}',\s]+/, '');
        const geoData = JSON.parse(cleanedText);
        setGeoJsonData(geoData);
      })
      .catch(error => console.error("Failed to load geoJsonData:", error));
  }, []);

  useEffect(() => {
    if (chartType !== 'map') {
      createChart();
    }
    createMapData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, chartType, yearRange, geoJsonData, xAxisColumn, yAxisColumn, selectedIsoCodes, barAggregation]);

  const handleIsoSelect = (code) => {
    if (selectedIsoCodes.includes(code)) {
      setSelectedIsoCodes(selectedIsoCodes.filter(c => c !== code));
    } else {
      setSelectedIsoCodes([...selectedIsoCodes, code]);
    }
  };

  const handleYearRangeChange = (event) => {
    const [start, end] = event.target.value.split('-');
    setYearRange([parseInt(start), parseInt(end)]);
  };

  const getRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  };

  const createChart = () => {
    if (chartRef.current) {
      chartRef.current.destroy();
    }
    if (!data || data.length === 0 || !yAxisColumn) return;

    const filteredData = data.filter(item => {
      let include = true;
      if (yearRange[0] !== null && yearRange[1] !== null) {
        include = include && (item.Year >= yearRange[0] && item.Year <= yearRange[1]);
      }
      if (selectedIsoCodes.length > 0) {
        include = include && selectedIsoCodes.includes(item.ISO3);
      }
      return include;
    });

    let chartData = {};

    if (
      chartType === 'line' &&
      (selectedIsoCodes.length === 0 || selectedIsoCodes.length >= 2) &&
      xAxisColumn !== "ISO3" &&
      yAxisColumn !== "ISO3"
    ) {
      const groups = {};
      filteredData.forEach(item => {
        const iso = item.ISO3;
        if (!groups[iso]) groups[iso] = [];
        groups[iso].push(item);
      });
      let labels = [];
      if (xAxisColumn) {
        const xValues = new Set();
        Object.values(groups).forEach(arr => {
          arr.forEach(item => xValues.add(item[xAxisColumn]));
        });
        labels = Array.from(xValues).sort((a, b) => a - b);
      } else {
        const maxLength = Math.max(...Object.values(groups).map(arr => arr.length));
        labels = Array.from({ length: maxLength }, (_, i) => i);
      }
      const datasets = Object.entries(groups).map(([iso, group]) => {
        const dataPoints = labels.map(label => {
          if (xAxisColumn) {
            const match = group.find(item => item[xAxisColumn] === label);
            return match ? match[yAxisColumn] : null;
          } else {
            return group[labels.indexOf(label)]
              ? group[labels.indexOf(label)][yAxisColumn]
              : null;
          }
        });
        return {
          label: iso,
          data: dataPoints,
          borderColor: getRandomColor(),
          fill: false,
        };
      });
      chartData = { labels, datasets };
    } else if (chartType === 'bar') {
      let groups = {};
      if (xAxisColumn) {
        filteredData.forEach(item => {
          const key = item[xAxisColumn];
          if (!groups[key]) groups[key] = [];
          groups[key].push(item);
        });
        const labels = Object.keys(groups).sort();
        const aggregatedData = labels.map(label => {
          const values = groups[label]
            .map(item => item[yAxisColumn])
            .filter(val => typeof val === 'number');
          if (values.length === 0) return null;
          if (barAggregation === 'average') {
            return values.reduce((sum, v) => sum + v, 0) / values.length;
          } else if (barAggregation === 'median') {
            const sorted = [...values].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0
              ? sorted[mid]
              : (sorted[mid - 1] + sorted[mid]) / 2;
          } else if (barAggregation === 'total') {
            return values.reduce((sum, v) => sum + v, 0);
          } else if (barAggregation === 'count') {
            return values.length;
          } else if (barAggregation === 'value') {
            return values.length === 1 ? values[0] : null;
          }
          return null;
        });
        const datasets = [{
          label: `${barAggregation} of ${yAxisColumn}`,
          data: aggregatedData,
          backgroundColor: getRandomColor(),
        }];
        chartData = { labels, datasets };
      } else {
        const labels = ['Aggregate'];
        const values = filteredData
          .map(item => item[yAxisColumn])
          .filter(val => typeof val === 'number');
        let aggregate = 0;
        if (values.length > 0) {
          if (barAggregation === 'average') {
            aggregate = values.reduce((sum, v) => sum + v, 0) / values.length;
          } else if (barAggregation === 'median') {
            const sorted = [...values].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            aggregate = sorted.length % 2 !== 0
              ? sorted[mid]
              : (sorted[mid - 1] + sorted[mid]) / 2;
          } else if (barAggregation === 'total') {
            aggregate = values.reduce((sum, v) => sum + v, 0);
          } else if (barAggregation === 'count' && values.length === 1) {
            aggregate = values.length;
          } else if (barAggregation === 'value') {
            aggregate = values.length === 1 ? values[0] : null;
          }
        }
        const datasets = [{
          label: `${barAggregation} of ${yAxisColumn}`,
          data: [aggregate],
          backgroundColor: getRandomColor(),
        }];
        chartData = { labels, datasets };
      }
    } else {
      if (xAxisColumn === "Year" || yAxisColumn === "Year") {
        const labels = filteredData.map((item, index) =>
          xAxisColumn && item[xAxisColumn] !== undefined ? item[xAxisColumn] : index
        );
        const datasets = [{
          label: yAxisColumn,
          data: filteredData.map(item => item[yAxisColumn]),
          borderColor: getRandomColor(),
          fill: false,
        }];
        chartData = { labels, datasets };
      } else {
        const groups = {};
        filteredData.forEach(item => {
          const yr = item.Year;
          if (!groups[yr]) groups[yr] = [];
          groups[yr].push(item);
        });
        let labels = [];
        let datasets = [];
        if (chartType === 'line') {
          if (xAxisColumn) {
            const xValues = new Set();
            Object.values(groups).forEach(group =>
              group.forEach(item => xValues.add(item[xAxisColumn]))
            );
            labels = Array.from(xValues).sort((a, b) => a - b);
          } else {
            const maxLength = Math.max(...Object.values(groups).map(group => group.length));
            labels = Array.from({ length: maxLength }, (_, i) => i);
          }
          datasets = Object.entries(groups).map(([yr, group]) => {
            const dataPoints = labels.map(label => {
              if (xAxisColumn) {
                const match = group.find(item => item[xAxisColumn] === label);
                return match ? match[yAxisColumn] : null;
              } else {
                return group[labels.indexOf(label)]
                  ? group[labels.indexOf(label)][yAxisColumn]
                  : null;
              }
            });
            return {
              label: `Year ${yr}`,
              data: dataPoints,
              borderColor: getRandomColor(),
              fill: false,
            };
          });
          chartData = { labels, datasets };
        }
      }
    }

    const ctx = document.getElementById('myChart');
    chartRef.current = new Chart(ctx, {
      type: chartType,
      data: chartData,
      options: {
        responsive: true,
        plugins: {
          legend: {
            onClick: null, // Disable legend item click functionality
          },
        },
        scales: {
          x: { title: { display: true, text: xAxisColumn || 'Index' } },
          y: { title: { display: true, text: yAxisColumn } },
        },
      },
    });
  };

  const createMapData = () => {
    if (!data || data.length === 0 || !geoJsonData || !yAxisColumn) return;
  
    const filteredData = data.filter(item => {
      let include = true;
      if (yearRange[0] !== null && yearRange[1] !== null) {
        include = include && (item.Year >= yearRange[0] && item.Year <= yearRange[1]);
      }
      if (selectedIsoCodes.length > 0) {
        include = include && selectedIsoCodes.includes(item.ISO3);
      }
      return include;
    });
  
    const newMapData = {};
    filteredData.forEach(item => {
      const countryCode = item.ISO3;
      const value = item[yAxisColumn];
      if (countryCode && typeof value === 'number') {
        newMapData[countryCode] = { value };
      }
    });
    setMapData(newMapData);
  };
  
  const svgRef = useRef(null);

  useEffect(() => {
    if (svgRef.current) {
      const svgElement = d3.select(svgRef.current);
      const zoomBehavior = d3.zoom()
        .scaleExtent([1, 8])
        .on('zoom', (event) => {
          svgElement.select('.zoomable').attr('transform', event.transform);
        });
      svgElement.call(zoomBehavior);
    }
  }, [geoJsonData, mapData]);

  const Map = ({ mapData }) => {
    const svgRef = useRef(null);

    useEffect(() => {
      if (svgRef.current) {
        const svgElement = d3.select(svgRef.current);
        const zoomBehavior = d3.zoom()
          .scaleExtent([1, 8])
          .on('zoom', (event) => {
            svgElement.select('.zoomable').attr('transform', event.transform);
          });
        svgElement.call(zoomBehavior);
      }
    }, [geoJsonData, mapData]);

    if (!geoJsonData) return <div>Loading map...</div>;
  
    const projection = geoMercator().fitSize([800, 400], geoJsonData);
    const pathGenerator = geoPath().projection(projection);
  
    if (Object.keys(mapData).length === 0) {
      return <svg width={800} height={400}></svg>;
    }
    const values = Object.values(mapData).map(item => item.value);
  
    if (values.length === 0) {
      return <svg width={800} height={400}></svg>;
    }
    function getColorDifference(c1, c2) {
      const toRgb = (color) => ({
      r: parseInt(color.substr(1, 2), 16),
      g: parseInt(color.substr(3, 2), 16),
      b: parseInt(color.substr(5, 2), 16)
      });
      const rgb1 = toRgb(c1);
      const rgb2 = toRgb(c2);
      return Math.sqrt(
      Math.pow(rgb1.r - rgb2.r, 2) +
      Math.pow(rgb1.g - rgb2.g, 2) +
      Math.pow(rgb1.b - rgb2.b, 2)
      );
    }
    
    const threshold = 100;
    let colorA = getRandomColor();
    let colorB = getRandomColor();
    while(getColorDifference(colorA, colorB) < threshold) {
      colorB = getRandomColor();
    }
    const colorList = [];
    for (let i = 0; i < 255; i++) {
      const r = Math.floor(i * (parseInt(colorB.slice(1, 3), 16) - parseInt(colorA.slice(1, 3), 16)) / 255 + parseInt(colorA.slice(1, 3), 16));
      const g = Math.floor(i * (parseInt(colorB.slice(3, 5), 16) - parseInt(colorA.slice(3, 5), 16)) / 255 + parseInt(colorA.slice(3, 5), 16));
      const b = Math.floor(i * (parseInt(colorB.slice(5, 7), 16) - parseInt(colorA.slice(5, 7), 16)) / 255 + parseInt(colorA.slice(5, 7), 16));
      colorList.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
    }
    //create a color scale
    const colorScale = scaleQuantize({
      domain: [Math.min(...values), Math.max(...values)],
      range: colorList
    });

    return (
      <div style={{ position: 'relative' }}>
      <div
        id="tooltip"
        style={{
        position: 'absolute',
        pointerEvents: 'none',
        background: 'rgba(0, 0, 0, 0.7)',
        color: '#fff',
        padding: '5px',
        borderRadius: '4px',
        fontSize: '12px',
        display: 'none',
        }}
      />
      <svg
        ref={svgRef}
        width="100%"
        height="auto"
        viewBox="0 0 1200 400"
        preserveAspectRatio="xMidYMid meet"
      >
        <g className="zoomable">
        {geoJsonData.features.map((feature, i) => {
          if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
          const countryCode = feature.properties.gu_a3;
          const fillColor = mapData[countryCode]
            ? colorScale(mapData[countryCode].value)
            : '#f0f0f5';
          return (
            <path
            key={`path-${i}`}
            d={pathGenerator(feature)}
            fill={fillColor}
            stroke="#ffffff"
            strokeWidth={0.5}
            onMouseOver={(e) => {
              const tooltip = document.getElementById('tooltip');
              tooltip.style.display = 'block';
              tooltip.style.top = e.clientY + 10 + 'px';
              tooltip.style.left = e.clientX + 10 + 'px';
              tooltip.innerHTML = `<strong>${countryCode}</strong><br/>Value: ${
              mapData[countryCode] ? mapData[countryCode].value : 'N/A'
              }`;
            }}
            onMouseMove={(e) => {
              const tooltip = document.getElementById('tooltip');
              tooltip.style.top = e.clientY + 10 + 'px';
              tooltip.style.left = e.clientX + 10 + 'px';
            }}
            onMouseOut={() => {
              const tooltip = document.getElementById('tooltip');
              tooltip.style.display = 'none';
            }}
            />
          );
          }
          return null;
        })}
        <defs>
          <linearGradient id="legendGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          {colorList.map((color, index) => (
            <stop
            key={index}
            offset={`${(index / (colorList.length - 1)) * 100}%`}
            stopColor={color}
            />
          ))}
          </linearGradient>
        </defs>
        <rect
          x="50"
          y="350"
          width="300"
          height="20"
          fill="url(#legendGradient)"
          stroke="#000"
          strokeWidth="1"
        />
        <text x="50" y="345" fontSize="12" fill="#000">
          {Math.min(...values)}
        </text>
        <text x="350" y="345" fontSize="12" fill="#000" textAnchor="end">
          {Math.max(...values)}
        </text>
        </g>
      </svg>
      </div>
    );
  };

  const downloadCSV = () => {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'data.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadImage = () => {
    const canvas = document.getElementById('myChart');
    if (canvas) {
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = 'chart.png';
      link.click();
    } else {
      const svg = document.querySelector('svg');
      if (svg) {
        const serializer = new XMLSerializer();
        const source = serializer.serializeToString(svg);
        const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'map.svg';
        link.click();
      }
    }
  };

  const uniqueIsoCodes = data.length > 0 
    ? [...new Set(data.map(item => item.ISO3).filter(Boolean))]
    : [];
  const CohMetrixColumns = [
    "DESPC", "DESSC", "DESWC", "DESPL", "DESPLd", "DESSL", "DESSLd", "DESWLsy", "DESWLsyd", "DESWLlt", "DESWLltd",
    "PCNARz", "PCNARp", "PCSYNz", "PCSYNp", "PCCNCz", "PCCNCp", "PCREFz", "PCREFp", "PCDCz", "PCDCp", "PCVERBz",
    "PCVERBp", "PCCONNz", "PCCONNp", "PCTEMPz", "PCTEMPp", "CRFNO1", "CRFAO1", "CRFSO1", "CRFNOa", "CRFAOa",
    "CRFSOa", "CRFCWO1", "CRFCWO1d", "CRFCWOa", "CRFCWOad", "LSASS1", "LSASS1d", "LSASSp", "LSASSpd", "LSAPP1",
    "LSAPP1d", "LSAGN", "LSAGNd", "LDTTRc", "LDTTRa", "LDMTLD", "LDVOCD", "CNCAll", "CNCCaus", "CNCLogic", "CNCADC",
    "CNCTemp", "CNCTempx", "CNCAdd", "CNCPos", "CNCNeg", "SMCAUSv", "SMCAUSvp", "SMINTEp", "SMCAUSr", "SMINTEr",
    "SMCAUSlsa", "SMCAUSwn", "SMTEMP", "SYNLE", "SYNNP", "SYNMEDpos", "SYNMEDwrd", "SYNMEDlem", "SYNSTRUTa",
    "SYNSTRUTt", "DRNP", "DRVP", "DRAP", "DRPP", "DRPVAL", "DRNEG", "DRGERUND", "DRINF", "WRDNOUN", "WRDVERB",
    "WRDADJ", "WRDADV", "WRDPRO", "WRDPRP1s", "WRDPRP1p", "WRDPRP2", "WRDPRP3s", "WRDPRP3p", "WRDFRQc", "WRDFRQa",
    "WRDFRQmc", "WRDAOAc", "WRDFAMc", "WRDCNCc", "WRDIMGc", "WRDMEAc", "WRDPOLc", "WRDHYPn", "WRDHYPv", "WRDHYPnv",
    "RDFRE", "RDFKGL", "RDL2"
  ];
  const LDAColumns = [
    "developmentsustainableagenda",
    "pacificislandsisland",
    "refugeesazerbaijanarmenia",
    "oftheunitednationstheunited",
    "timeyearscountry",
    "countriesdevelopingworld",
    "cyprusiraqturkey",
    "climatechangeglobal",
    "worldnationspower",
    "nationsunitedoperation",
    "sustainableglobalclimate",
    "operationsouthunited",
    "latinamericaamerican",
    "israelpeacepalestinian",
    "europeaneuropeunion",
    "governmentsouthagreement",
    "countriesworldnations",
    "securityglobaleconomic",
    "securityarabregion",
    "southafricaeconomic",
    "unitednationscouncil",
    "ukrainerussiageorgia",
    "centralpeaceamerica",
    "peoplesworldpeace",
    "peopleworldchildren",
    "countryrepublicafrican",
    "afghanistanpakistanindia",
    "africaafricanpeace",
    "rightshumannations",
    "presidentmrclimate",
    "nuclearweaponstreaty",
    "peopleworldpeoples",
    "developmenteconomicsocial",
    "unitednationssri",
    "peacecountriescommunity",
    "peoplecountrygovernment",
    "worldpoliticalnations",
    "peaceuniteddevelopment",
    "africasouthpeople",
    "unitedstatespeople",
    "worldnationspeace",
    "organizationreformdrug",
    "centmillion",
    "developmentunitednations",
    "peoplekoreaviet",
    "statescaribbeansmall",
    "terrorismunitedsecurity",
    "statessovietrepublic",
    "nationsunitedworld",
    "countriesdevelopmentefforts"
  ];
  const LIWCColumns = [
    "wc", "analytic", "clout", "authentic", "tone", "wps", "bigwords", "dic", "linguistic", "function", "pronoun", 
    "ppron", "i", "we", "you", "shehe", "they", "ipron", "det", "article", "number", "prep", "auxverb", "adverb", 
    "conj", "negate", "verb", "adj", "quantity", "drives", "affiliation", "achieve", "power", "cognition", "allnone", 
    "cogproc", "insight", "cause", "discrep", "tentat", "certitude", "differ", "memory", "affect", "tone_pos", 
    "tone_neg", "emotion", "emo_pos", "emo_neg", "emo_anx", "emo_anger", "emo_sad", "swear", "social", "socbehav", 
    "prosocial", "polite", "conflict", "moral", "comm", "socrefs", "family", "friend", "female", "male", "culture", 
    "politic", "ethnicity", "tech", "lifestyle", "leisure", "home", "work", "money", "relig", "physical", "health", 
    "illness", "wellness", "mental", "substances", "sexual", "food", "death", "need", "want", "acquire", "lack", 
    "fulfill", "fatigue", "reward", "risk", "curiosity", "allure", "perception", "attention", "motion", "space", 
    "visual", "auditory", "feeling", "time", "focuspast", "focuspresent", "focusfuture", "conversation", "netspeak", 
    "assent", "nonflu", "filler", "allpunc", "period", "comma", "qmark", "exclam", "apostro", "otherp", "emoji"
  ];
  const availableColumns = data.length > 0
    ? Object.keys(data[0]).filter(column => {
        if (column === 'Year' || column === 'ISO3') {
          return true; // Always include Year and ISO3
        }
        if (AxisColumnFilter.includes('CohMetrix') && CohMetrixColumns.includes(column)) {
          return true;
        }
        if (AxisColumnFilter.includes('LDA') && LDAColumns.includes(column)) {
          return true;
        }
        if (AxisColumnFilter.includes('LIWC') && LIWCColumns.includes(column)) {
          return true;
        }
        return AxisColumnFilter.length === 0; // Show all columns if no filter is selected
      })
    : [];

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Sidebar */}
      <div
        style={{
          width: '25%',
          backgroundColor: '#f8f9fa',
          padding: '20px',
          overflowY: 'auto',
        }}
      >

        <h2>About the data dashboard</h2>
        <p>
          This project was funded by the National Science Foundation (Language Across Cultures: The Communication
          Styles of World Leaders, #2117009) between 2021-2025.
        </p>
        <h2>Project team</h2>
        <p><strong>Leah C. Windsor, PI</strong></p>
        <p>Director, Institute for Intelligent Systems (IIS)</p>
        <p>Associate Professor of Applied Linguistics</p>
        <p>Institute for Intelligent Systems + Department of English</p>
        <p><strong>Alistair Windsor, co-PI</strong></p>
        <p>Associate Professor, Department of Mathematical Sciences</p>
        <p>Faculty Affiliate, IIS</p>
        <p><strong>Miriam Van Mersbergen, co-PI</strong></p>
        <p>Associate Professor, School of Communication Sciences and Disorders</p>
        <p>Faculty Affiliate, IIS</p>
        <p><strong>Nicholas Simon, co-PI</strong></p>
        <p>Associate Professor, Department of Psychology</p>
        <p>Faculty Affiliate, IIS</p>
        <p><strong>J. Elliott Casal</strong></p>
        <p>Assistant Professor of Applied Linguistics, Department of English</p>
        <p>Faculty Affiliate, IIS</p>
        <p><strong>Deborah Tollefsen</strong></p>
        <p>Dean, Graduate School</p>
        <p>Professor, Department of Psychology</p>
        <p>Faculty Affiliate, IIS</p>
        <p><strong>Shaun Gallagher</strong></p>
        <p>Professor, Department of Psychology</p>
        <p>Faculty Affiliate, IIS</p>
        <p><strong>James “Rusty” Haner</strong></p>
        <p>Senior Software Developer, IIS</p>
        <p><strong>August White</strong></p>
        <p>Senior Software Developer, IIS</p>
        <h2>Dashboard features</h2>
        <p>
          This dashboard provides a variety of linguistic features for three different analytic approaches. These
          include Coh-Metrix (107 features), LIWC (118 features), and LDA (50 features).
        </p>
        <h2>How to use the dashboard</h2>
        <ol>
          <li>Determine which features you would like to graph from Coh-Metrix, LIWC, and/or LDA.</li>
          <li>Select the appropriate X-axis variable and Y-axis variable, chart type, and chart aggregation (if applicable).</li>
          <li>You can download the data as a CSV, or as a chart or map.</li>
          <li>To reset the parameters and model a new feature or representation, click “Clear ISO filter.”</li>
        </ol>
      </div>

      
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
          <h1>LAC UNGA Dashboard</h1>
          {loading && <p>Loading data...</p>}
          {!loading && data.length === 0 && <p>No data available.</p>}
          {!loading && data.length > 0 && (
          <div class="container">
            <div class="row">
          <div class="col-md-12">
            <label>Filter Columns:</label>
            <br />
            <label style={{ marginRight: '10px' }}>
              <input
            type="checkbox"
            onChange={(e) => {
              if (e.target.checked) {
                setAxisColumnFilter([...AxisColumnFilter, 'CohMetrix']);
              } else {
                setAxisColumnFilter(AxisColumnFilter.filter(col => col !== 'CohMetrix'));
              }
            }}
              />
              CohMetrix
            </label>
            <label style={{ marginRight: '10px' }}>
              <input
            type="checkbox"
            onChange={(e) => {
              if (e.target.checked) {
                setAxisColumnFilter([...AxisColumnFilter, 'LDA']);
              } else {
                setAxisColumnFilter(AxisColumnFilter.filter(col => col !== 'LDA'));
              }
            }}
              />
              LDA
            </label>
            <label style={{ marginRight: '10px' }}>
              <input
            type="checkbox"
            onChange={(e) => {
              if (e.target.checked) {
                setAxisColumnFilter([...AxisColumnFilter, 'LIWC']);
              } else {
                setAxisColumnFilter(AxisColumnFilter.filter(col => col !== 'LIWC'));
              }
            }}
              />
              LIWC
            </label>
          </div>
          <div class="col-md-6">
            <label htmlFor="xAxisSelect">Select X-Axis Column:</label>
            <select
              class="form-select" 
              id="xAxisSelect"
              value={xAxisColumn}
              onChange={(e) => setXAxisColumn(e.target.value)}
              disabled={chartType === 'map'}
            >
              <option value="">-- Select Column --</option>
              {availableColumns.map(column => (
            <option key={column} value={column}>{column}</option>
              ))}
            </select>
          </div>

          <div class="col-md-6">
            <label htmlFor="yAxisSelect">Select Y-Axis Column:</label>
            <select
              class="form-select" 
              id="yAxisSelect"
              value={yAxisColumn}
              onChange={(e) => setYAxisColumn(e.target.value)}
            >
              <option value="">-- Select Column --</option>
              {availableColumns.map(column => (
            <option key={column} value={column}>{column}</option>
              ))}
            </select>
          </div>
            </div>
            <br></br>

            {uniqueIsoCodes.length > 0 && (
          <div>
            <label>Select ISO Codes:</label>
            <br></br>
            {uniqueIsoCodes.map(code => (
              <label key={code} style={{ marginRight: '10px' }}>
            <input
              type="checkbox"
              checked={selectedIsoCodes.includes(code)}
              onChange={() => handleIsoSelect(code)}
            />
            {code}
              </label>
            ))}
            <br></br>
            <button class="btn btn-warning" onClick={() => setSelectedIsoCodes([])}>Clear ISO Filter</button>
            
          </div>
            )}

            
          <div>
            <label htmlFor="startYear">Start Year:</label>
            <input
              type="range"
              id="startYear"
              min={
            data.length > 0
              ? Math.min(...data.map(item => item.Year).filter(year => typeof year === 'number'))
              : 1900
              }
              max={
            data.length > 0
              ? Math.max(...data.map(item => item.Year).filter(year => typeof year === 'number'))
              : 2023
              }
              step={1}
              value={yearRange[0] || ''}
              onChange={(e) => {
                  const newStart = parseInt(e.target.value);
                  setYearRange([newStart, yearRange[1] !== null ? yearRange[1] : newStart]);
                }}
              />
              <span>{yearRange[0] || 'All'}</span>
            </div>
            <div>
              <label htmlFor="endYear">End Year:</label>
              <input
                type="range"
                id="endYear"
                min={
                  data.length > 0
                    ? Math.min(...data.map(item => item.Year).filter(year => typeof year === 'number'))
                    : 1900
                }
                max={
                  data.length > 0
                    ? Math.max(...data.map(item => item.Year).filter(year => typeof year === 'number'))
                    : 2023
                }
                step={1}
                value={yearRange[1] || ''}
                onChange={(e) => {
                  const newEnd = parseInt(e.target.value);
                  setYearRange([yearRange[0] !== null ? yearRange[0] : newEnd, newEnd]);
                }}
              />
              <span>{yearRange[1] || 'All'}</span>
            </div>
      

          <div>
            <label htmlFor="chartType">Chart Type:</label>
            <select class="form-select" id="chartType" value={chartType} onChange={(e) => setChartType(e.target.value)}>
              <option value="line">Line</option>
              <option value="bar">Bar</option>
              <option value="map">Map</option>
            </select>
          </div>

          {chartType === 'bar' && (
            <div>
              <label htmlFor="barAggregation">Bar Aggregation:</label>
              <select
                class="form-select" 
                id="barAggregation"
                value={barAggregation}
                onChange={(e) => setBarAggregation(e.target.value)}
              >
                <option value="value">Value (Must have only one year selected)</option>
                <option value="count">Count</option>
                <option value="average">Average</option>
                <option value="median">Median</option>
                <option value="total">Total</option>
              </select>
            </div>
          )}

          {chartType !== 'map' && <canvas id="myChart"></canvas>}
          {chartType === 'map' && <Map mapData={mapData} />}

          <div></div>
            <button class="btn btn-primary my-2" onClick={downloadCSV}>Download CSV</button><br />
            <button class="btn btn-primary" onClick={downloadImage}>Download Chart/Map</button>
          </div>
          )}

          
        </div>
      </div>
  );
};

export default App;