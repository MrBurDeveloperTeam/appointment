export function getColorBg(color) {
  const colorMap = {
    '#4A90A4': '#E8F4F8',
    '#7CB798': '#E8F5EE',
    '#E5C07B': '#FDF6E8',
    '#9B8AC4': '#F3F0F9',
    '#E07B7B': '#FDEEEE',
    '#A8D8EA': '#E9F7FC',
  };
  return colorMap[color] || '#E8F4F8';
}

export function getContrastText(color) {
  const textColorMap = {
    '#4A90A4': '#FFFFFF',
    '#7CB798': '#FFFFFF',
    '#E5C07B': '#FFFFFF',
    '#9B8AC4': '#FFFFFF',
    '#E07B7B': '#FFFFFF',
    '#A8D8EA': '#0F172A',
  };

  return textColorMap[color] || '#FFFFFF';
}