<template>
  <div class="scatter-plot">
    <div ref="plotContainer" class="plot-container"></div>
  </div>
</template>

<script setup>
import Plotly from 'plotly.js-dist-min';
import { nextTick, onMounted, ref, watch } from 'vue';

const props = defineProps({
  points: {
    type: Array,
    required: true
  },
  colorBy: {
    type: String,
    default: 'category' // 'category', 'piiRisk', 'date'
  },
  selectedPoints: {
    type: Array,
    default: () => []
  },
  height: {
    type: Number,
    default: 600
  }
});

const emit = defineEmits(['point-click', 'selection-change']);

const plotContainer = ref(null);

// Color schemes
const categoryColors = {
  'Restaurant': '#FF6B6B',
  'Hotel': '#4ECDC4',
  'Technology': '#45B7D1',
  'Shopping': '#FFA07A',
  'Attraction': '#98D8C8',
  'Cafe': '#FFD93D',
  'Coworking': '#6C5CE7',
  'Gym': '#A8E6CF',
  'Hospital': '#FF8B94',
  'Museum': '#C7CEEA',
  'University': '#FFEAA7',
  'Unknown': '#95A5A6'
};

const piiRiskColors = {
  'none': '#2ECC71',
  'low': '#F39C12',
  'medium': '#E67E22',
  'high': '#E74C3C',
  'critical': '#8E44AD'
};

function getColorByAttribute(point, attribute) {
  if (attribute === 'category') {
    return categoryColors[point.category] || categoryColors['Unknown'];
  } else if (attribute === 'piiRisk') {
    return piiRiskColors[point.piiRisk] || piiRiskColors['none'];
  } else if (attribute === 'date') {
    // Gradient based on date (newer = blue, older = red)
    if (!point.date) return '#95A5A6';
    const timestamp = new Date(point.date).getTime();
    const now = Date.now();
    const daysSince = (now - timestamp) / (1000 * 60 * 60 * 24);
    const hue = Math.max(0, Math.min(240, 240 - (daysSince * 2))); // 240=blue, 0=red
    return `hsl(${hue}, 70%, 50%)`;
  }
  return '#3498DB';
}

function createPlot() {
  if (!plotContainer.value || props.points.length === 0) return;

  // Group points by attribute for separate traces
  const groups = {};
  props.points.forEach(point => {
    const key = props.colorBy === 'category' ? point.category :
                props.colorBy === 'piiRisk' ? point.piiRisk :
                'all';
    
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(point);
  });

  // Create traces for each group
  const traces = Object.entries(groups).map(([groupName, groupPoints]) => {
    const color = props.colorBy === 'category' ? categoryColors[groupName] :
                  props.colorBy === 'piiRisk' ? piiRiskColors[groupName] :
                  '#3498DB';

    return {
      x: groupPoints.map(p => p.x),
      y: groupPoints.map(p => p.y),
      mode: 'markers',
      type: 'scatter',
      name: groupName,
      text: groupPoints.map(p => p.title),
      customdata: groupPoints.map(p => ({
        id: p.id,
        title: p.title,
        category: p.category,
        location: p.location,
        tags: p.tags,
        piiRisk: p.piiRisk,
        snippet: p.snippet
      })),
      marker: {
        size: 8,
        color: color,
        opacity: 0.7,
        line: {
          width: 1,
          color: 'white'
        }
      },
      hovertemplate: 
        '<b>%{customdata.title}</b><br>' +
        'Category: %{customdata.category}<br>' +
        'Location: %{customdata.location}<br>' +
        'PII Risk: %{customdata.piiRisk}<br>' +
        '<extra></extra>'
    };
  });

  const layout = {
    title: {
      text: 'Document Cluster Visualization',
      font: { size: 18 }
    },
    xaxis: {
      title: 'UMAP Dimension 1',
      showgrid: true,
      zeroline: false
    },
    yaxis: {
      title: 'UMAP Dimension 2',
      showgrid: true,
      zeroline: false
    },
    hovermode: 'closest',
    height: props.height,
    showlegend: true,
    legend: {
      orientation: 'v',
      x: 1.02,
      y: 1,
      bgcolor: 'rgba(255, 255, 255, 0.8)',
      bordercolor: '#ddd',
      borderwidth: 1
    },
    dragmode: 'select', // Enable box selection by default
    selectdirection: 'any'
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToAdd: ['lasso2d', 'select2d'],
    displaylogo: false
  };

  Plotly.newPlot(plotContainer.value, traces, layout, config);

  // Handle click events
  plotContainer.value.on('plotly_click', (data) => {
    if (data.points && data.points.length > 0) {
      const point = data.points[0];
      emit('point-click', point.customdata);
    }
  });

  // Handle selection events (lasso/box select)
  plotContainer.value.on('plotly_selected', (data) => {
    if (data && data.points) {
      const selected = data.points.map(p => p.customdata);
      emit('selection-change', selected);
    }
  });

  // Handle deselect
  plotContainer.value.on('plotly_deselect', () => {
    emit('selection-change', []);
  });
}

onMounted(() => {
  nextTick(() => {
    createPlot();
  });
});

watch(() => [props.points, props.colorBy], () => {
  nextTick(() => {
    createPlot();
  });
}, { deep: true });

// Handle window resize
onMounted(() => {
  const handleResize = () => {
    if (plotContainer.value) {
      Plotly.Plots.resize(plotContainer.value);
    }
  };
  window.addEventListener('resize', handleResize);
  
  // Cleanup
  return () => {
    window.removeEventListener('resize', handleResize);
  };
});

// Expose method to clear selection
const clearSelection = () => {
  if (plotContainer.value) {
    // Clear any selection shapes from the layout
    Plotly.relayout(plotContainer.value, {
      'selections': []
    });
    
    // Clear selectedpoints for all traces
    if (plotContainer.value.data) {
      const numTraces = plotContainer.value.data.length;
      const update = {};
      for (let i = 0; i < numTraces; i++) {
        update[`selectedpoints[${i}]`] = null;
      }
      Plotly.restyle(plotContainer.value, update);
    }
    
    // Trigger deselect event
    plotContainer.value.emit('plotly_deselect');
  }
};

defineExpose({
  clearSelection
});
</script>

<style scoped>
.scatter-plot {
  width: 100%;
  height: 100%;
}

.plot-container {
  width: 100%;
  height: 100%;
}
</style>
