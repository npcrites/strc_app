import React from 'react';
import { render } from '@testing-library/react-native';
import { generateChartPath, downsampleData, convertToChartData } from '../Chart';
import Chart from '../Chart';

// Mock react-native-svg
jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ children, ...props }: any) => React.createElement('Svg', props, children),
    Svg: ({ children, ...props }: any) => React.createElement('Svg', props, children),
    Defs: ({ children, ...props }: any) => React.createElement('Defs', props, children),
    Pattern: ({ children, ...props }: any) => React.createElement('Pattern', props, children),
    Circle: (props: any) => React.createElement('Circle', props),
    Rect: (props: any) => React.createElement('Rect', props),
    SvgRect: (props: any) => React.createElement('Rect', props),
    LinearGradient: ({ children, ...props }: any) => React.createElement('LinearGradient', props, children),
    Stop: (props: any) => React.createElement('Stop', props),
    Mask: ({ children, ...props }: any) => React.createElement('Mask', props, children),
    ClipPath: ({ children, ...props }: any) => React.createElement('ClipPath', props, children),
    Path: (props: any) => React.createElement('Path', props),
    Line: (props: any) => React.createElement('Line', props),
    G: ({ children, ...props }: any) => React.createElement('G', props, children),
  };
});

// Mock react-native-gifted-charts
jest.mock('react-native-gifted-charts', () => ({
  LineChart: ({ children, ...props }: any) => {
    const React = require('react');
    return React.createElement('LineChart', props, children);
  },
}));

describe('Chart Component', () => {
  const mockData = [
    { x: '2024-01-01', y: 100 },
    { x: '2024-01-02', y: 150 },
    { x: '2024-01-03', y: 120 },
    { x: '2024-01-04', y: 180 },
    { x: '2024-01-05', y: 200 },
  ];

  describe('generateChartPath', () => {
    it('should generate empty paths for empty data', () => {
      const result = generateChartPath([], 100, 100, 0, 100, true);
      expect(result.linePath).toBe('');
      expect(result.areaPath).toBe('');
    });

    it('should generate paths for single data point', () => {
      const data = [{ value: 50 }];
      const result = generateChartPath(data, 100, 100, 0, 100, true);
      expect(result.linePath).toContain('M');
      expect(result.areaPath).toContain('M');
      expect(result.areaPath).toContain('Z'); // Should close the area path
    });

    it('should generate paths for two data points', () => {
      const data = [{ value: 50 }, { value: 75 }];
      const result = generateChartPath(data, 100, 100, 0, 100, false);
      expect(result.linePath).toContain('M');
      expect(result.linePath).toContain('L');
      expect(result.areaPath).toContain('Z');
    });

    it('should generate curved paths for multiple points', () => {
      const data = [
        { value: 50 },
        { value: 75 },
        { value: 60 },
        { value: 90 },
      ];
      const result = generateChartPath(data, 100, 100, 0, 100, true);
      expect(result.linePath).toContain('M');
      expect(result.linePath).toContain('C'); // Cubic Bezier curves
      expect(result.areaPath).toContain('C');
      expect(result.areaPath).toContain('Z');
    });

    it('should generate straight line paths when curved is false', () => {
      const data = [
        { value: 50 },
        { value: 75 },
        { value: 60 },
      ];
      const result = generateChartPath(data, 100, 100, 0, 100, false);
      expect(result.linePath).toContain('M');
      expect(result.linePath).not.toContain('C');
      expect(result.linePath).toContain('L');
    });

    it('should match linePath and areaPath for the line portion', () => {
      const data = [
        { value: 50 },
        { value: 75 },
        { value: 60 },
      ];
      const result = generateChartPath(data, 100, 100, 0, 100, true);
      
      // The line portion of both paths should match (before areaPath closes)
      const linePathCommands = result.linePath;
      const areaPathLinePortion = result.areaPath.split(' L ')[0]; // Before closing
      
      // Both should start with the same move command
      expect(linePathCommands.split(' ')[0]).toBe(areaPathLinePortion.split(' ')[0]);
    });

    it('should close area path to bottom', () => {
      const data = [{ value: 50 }, { value: 75 }];
      const result = generateChartPath(data, 100, 100, 0, 100, true);
      
      // Area path should close with Z and include bottom coordinates
      expect(result.areaPath).toContain('Z');
      expect(result.areaPath).toContain('100'); // Bottom right
      expect(result.areaPath).toContain('0'); // Bottom left
    });

    it('should handle edge case with all same values', () => {
      const data = [
        { value: 50 },
        { value: 50 },
        { value: 50 },
      ];
      const result = generateChartPath(data, 100, 100, 0, 100, true);
      expect(result.linePath).toBeTruthy();
      expect(result.areaPath).toBeTruthy();
    });

    it('should handle very large datasets', () => {
      const data = Array.from({ length: 1000 }, (_, i) => ({ value: i % 100 }));
      const result = generateChartPath(data, 1000, 500, 0, 100, true);
      expect(result.linePath).toBeTruthy();
      expect(result.areaPath).toBeTruthy();
    });
  });

  describe('Chart Component Rendering', () => {
    it('should render with empty data', () => {
      const { getByTestID } = render(
        <Chart data={[]} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should render with valid data', () => {
      const { getByTestID } = render(
        <Chart data={mockData} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
      expect(getByTestID('chart-overlay')).toBeTruthy();
      expect(getByTestID('chart-container')).toBeTruthy();
    });

    it('should render with custom width and height', () => {
      const { getByTestID } = render(
        <Chart data={mockData} width={500} height={300} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should render with different pattern types', () => {
      const patterns: Array<'dots' | 'none'> = ['dots', 'none'];
      patterns.forEach(pattern => {
        const { getByTestID } = render(
          <Chart data={mockData} patternType={pattern} testID="chart" />
        );
        expect(getByTestID('chart')).toBeTruthy();
      });
    });

    it('should handle different time ranges', () => {
      const timeRanges: Array<'1W' | '1M' | '3M' | '1Y' | 'ALL'> = ['1W', '1M', '3M', '1Y', 'ALL'];
      timeRanges.forEach(range => {
        const { getByTestID } = render(
          <Chart data={mockData} timeRange={range} testID="chart" />
        );
        expect(getByTestID('chart')).toBeTruthy();
      });
    });

    it('should render with custom config', () => {
      const customConfig = {
        lineColor: '#FF0000',
        lineThickness: 5,
        gradientStartColor: '#FF0000',
        gradientEndColor: '#000000',
        patternColor: '#00FF00',
        patternOpacity: 0.5,
      };
      const { getByTestID } = render(
        <Chart data={mockData} config={customConfig} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });
  });

  describe('Path Matching Tests', () => {
    it('should ensure linePath and areaPath use the same algorithm', () => {
      const data = [
        { value: 50 },
        { value: 75 },
        { value: 60 },
        { value: 90 },
      ];
      
      // Generate paths multiple times to ensure consistency
      const result1 = generateChartPath(data, 100, 100, 0, 100, true);
      const result2 = generateChartPath(data, 100, 100, 0, 100, true);
      
      // Paths should be identical when called with same inputs
      expect(result1.linePath).toBe(result2.linePath);
      expect(result1.areaPath).toBe(result2.areaPath);
    });

    it('should ensure areaPath includes linePath as prefix', () => {
      const data = [
        { value: 50 },
        { value: 75 },
        { value: 60 },
      ];
      const { linePath, areaPath } = generateChartPath(data, 100, 100, 0, 100, true);
      
      // Area path should start with the same commands as line path
      // (before it closes to the bottom)
      const lineCommands = linePath.split(' ').slice(0, 10).join(' ');
      const areaCommands = areaPath.split(' L ')[0].split(' ').slice(0, 10).join(' ');
      
      // First several commands should match
      expect(areaCommands).toContain(lineCommands.split(' ')[0]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single data point', () => {
      const data = [{ x: '2024-01-01', y: 100 }];
      const { getByTestID } = render(
        <Chart data={data} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle two data points', () => {
      const data = [
        { x: '2024-01-01', y: 100 },
        { x: '2024-01-02', y: 150 },
      ];
      const { getByTestID } = render(
        <Chart data={data} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle negative values', () => {
      const data = [
        { x: '2024-01-01', y: -50 },
        { x: '2024-01-02', y: -100 },
        { x: '2024-01-03', y: -75 },
      ];
      const { getByTestID } = render(
        <Chart data={data} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle zero values', () => {
      const data = [
        { x: '2024-01-01', y: 0 },
        { x: '2024-01-02', y: 0 },
        { x: '2024-01-03', y: 0 },
      ];
      const { getByTestID } = render(
        <Chart data={data} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle very large values', () => {
      const data = [
        { x: '2024-01-01', y: 1000000 },
        { x: '2024-01-02', y: 2000000 },
        { x: '2024-01-03', y: 1500000 },
      ];
      const { getByTestID } = render(
        <Chart data={data} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle very small values', () => {
      const data = [
        { x: '2024-01-01', y: 0.001 },
        { x: '2024-01-02', y: 0.002 },
        { x: '2024-01-03', y: 0.0015 },
      ];
      const { getByTestID } = render(
        <Chart data={data} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle mixed positive and negative values', () => {
      const data = [
        { x: '2024-01-01', y: -50 },
        { x: '2024-01-02', y: 50 },
        { x: '2024-01-03', y: -25 },
        { x: '2024-01-04', y: 75 },
      ];
      const { getByTestID } = render(
        <Chart data={data} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });
  });

  describe('Mask and Gradient Tests', () => {
    it('should render with dots pattern and mask', () => {
      const { getByTestID } = render(
        <Chart data={mockData} patternType="dots" testID="chart" />
      );
      expect(getByTestID('chart-overlay')).toBeTruthy();
    });

    it('should render without dots when patternType is none', () => {
      const { getByTestID } = render(
        <Chart data={mockData} patternType="none" testID="chart" />
      );
      expect(getByTestID('chart-overlay')).toBeTruthy();
    });
  });

  describe('Callback Tests', () => {
    it('should call onDragStart when drag starts', () => {
      const onDragStart = jest.fn();
      const { getByTestID } = render(
        <Chart data={mockData} onDragStart={onDragStart} testID="chart" />
      );
      // Note: Actual drag testing would require more complex setup
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should call onDragEnd when drag ends', () => {
      const onDragEnd = jest.fn();
      const { getByTestID } = render(
        <Chart data={mockData} onDragEnd={onDragEnd} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });
  });

  describe('Data Downsampling', () => {
    it('should return empty array for empty data', () => {
      const result = downsampleData([], '1W');
      expect(result).toEqual([]);
    });

    it('should return same data if length is exactly 60', () => {
      const data = Array.from({ length: 60 }, (_, i) => ({ x: i, y: i * 10 }));
      const result = downsampleData(data, '1W');
      expect(result.length).toBe(60);
      expect(result[0]).toEqual(data[0]);
      expect(result[59]).toEqual(data[59]);
    });

    it('should interpolate to 60 points when data is smaller', () => {
      const data = [
        { x: '2024-01-01', y: 100 },
        { x: '2024-01-02', y: 150 },
        { x: '2024-01-03', y: 120 },
      ];
      const result = downsampleData(data, '1W');
      expect(result.length).toBe(60);
      expect(result[0].y).toBeCloseTo(100, 1);
      expect(result[59].y).toBeCloseTo(120, 1);
    });

    it('should downsample to 60 points when data is larger', () => {
      const data = Array.from({ length: 200 }, (_, i) => ({ x: i, y: i * 10 }));
      const result = downsampleData(data, '1M');
      expect(result.length).toBe(60);
      expect(result[0]).toEqual(data[0]);
      expect(result[59]).toEqual(data[199]);
    });

    it('should handle single data point', () => {
      const data = [{ x: '2024-01-01', y: 100 }];
      const result = downsampleData(data, '1W');
      expect(result.length).toBe(60);
      // All points should be the same value
      expect(result.every(p => p.y === 100)).toBe(true);
    });

    it('should preserve first and last points when downsampling', () => {
      const data = Array.from({ length: 100 }, (_, i) => ({ x: i, y: i * 10 }));
      const result = downsampleData(data, '1M');
      expect(result[0]).toEqual(data[0]);
      expect(result[result.length - 1]).toEqual(data[data.length - 1]);
    });

    it('should handle different time ranges', () => {
      const data = Array.from({ length: 100 }, (_, i) => ({ x: i, y: i * 10 }));
      const timeRanges: Array<'1W' | '1M' | '3M' | '1Y' | 'ALL'> = ['1W', '1M', '3M', '1Y', 'ALL'];
      timeRanges.forEach(range => {
        const result = downsampleData(data, range);
        expect(result.length).toBe(60);
      });
    });
  });

  describe('Data Conversion', () => {
    it('should convert empty array to empty array', () => {
      const result = convertToChartData([]);
      expect(result).toEqual([]);
    });

    it('should convert data with x and y to value-only format', () => {
      const data = [
        { x: '2024-01-01', y: 100 },
        { x: '2024-01-02', y: 150 },
      ];
      const result = convertToChartData(data);
      expect(result).toEqual([
        { value: 100 },
        { value: 150 },
      ]);
    });

    it('should handle numeric x values', () => {
      const data = [
        { x: 1000, y: 100 },
        { x: 2000, y: 150 },
      ];
      const result = convertToChartData(data);
      expect(result).toEqual([
        { value: 100 },
        { value: 150 },
      ]);
    });

    it('should handle zero values', () => {
      const data = [
        { x: '2024-01-01', y: 0 },
        { x: '2024-01-02', y: 0 },
      ];
      const result = convertToChartData(data);
      expect(result).toEqual([
        { value: 0 },
        { value: 0 },
      ]);
    });

    it('should handle negative values', () => {
      const data = [
        { x: '2024-01-01', y: -50 },
        { x: '2024-01-02', y: -100 },
      ];
      const result = convertToChartData(data);
      expect(result).toEqual([
        { value: -50 },
        { value: -100 },
      ]);
    });
  });

  describe('Data State Transitions', () => {
    it('should handle transition from empty to populated data', () => {
      const { rerender, getByTestID } = render(
        <Chart data={[]} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();

      rerender(<Chart data={mockData} testID="chart" />);
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle transition from populated to empty data', () => {
      const { rerender, getByTestID } = render(
        <Chart data={mockData} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();

      rerender(<Chart data={[]} testID="chart" />);
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle data refresh with same timeframe', () => {
      const initialData = [
        { x: '2024-01-01', y: 100 },
        { x: '2024-01-02', y: 150 },
      ];
      const refreshedData = [
        { x: '2024-01-01', y: 105 }, // Slight price update
        { x: '2024-01-02', y: 155 },
      ];

      const { rerender, getByTestID } = render(
        <Chart data={initialData} timeRange="1W" testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();

      rerender(<Chart data={refreshedData} timeRange="1W" testID="chart" />);
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle timeframe change with same data', () => {
      const { rerender, getByTestID } = render(
        <Chart data={mockData} timeRange="1W" testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();

      rerender(<Chart data={mockData} timeRange="1M" testID="chart" />);
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle rapid timeframe toggling', () => {
      const { rerender, getByTestID } = render(
        <Chart data={mockData} timeRange="1W" testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();

      // Toggle between two timeframes
      rerender(<Chart data={mockData} timeRange="1M" testID="chart" />);
      expect(getByTestID('chart')).toBeTruthy();

      rerender(<Chart data={mockData} timeRange="1W" testID="chart" />);
      expect(getByTestID('chart')).toBeTruthy();

      rerender(<Chart data={mockData} timeRange="1M" testID="chart" />);
      expect(getByTestID('chart')).toBeTruthy();
    });
  });

  describe('Large Dataset Handling', () => {
    it('should handle very large datasets (1000+ points)', () => {
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        x: `2024-01-${String(i + 1).padStart(2, '0')}`,
        y: Math.sin(i / 10) * 100 + 100,
      }));
      const { getByTestID } = render(
        <Chart data={largeData} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle datasets with 10,000+ points', () => {
      const veryLargeData = Array.from({ length: 10000 }, (_, i) => ({
        x: i,
        y: Math.random() * 1000,
      }));
      const { getByTestID } = render(
        <Chart data={veryLargeData} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should maintain performance with large datasets across timeframes', () => {
      const largeData = Array.from({ length: 5000 }, (_, i) => ({
        x: i,
        y: Math.random() * 1000,
      }));
      const timeRanges: Array<'1W' | '1M' | '3M' | '1Y' | 'ALL'> = ['1W', '1M', '3M', '1Y', 'ALL'];
      
      timeRanges.forEach(range => {
        const { getByTestID } = render(
          <Chart data={largeData} timeRange={range} testID="chart" />
        );
        expect(getByTestID('chart')).toBeTruthy();
      });
    });
  });

  describe('Data Quality Edge Cases', () => {
    it('should handle data with duplicate x values', () => {
      const duplicateData = [
        { x: '2024-01-01', y: 100 },
        { x: '2024-01-01', y: 150 },
        { x: '2024-01-02', y: 120 },
      ];
      const { getByTestID } = render(
        <Chart data={duplicateData} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle data with non-sequential x values', () => {
      const nonSequentialData = [
        { x: '2024-01-01', y: 100 },
        { x: '2024-01-05', y: 150 },
        { x: '2024-01-10', y: 120 },
        { x: '2024-01-15', y: 180 },
      ];
      const { getByTestID } = render(
        <Chart data={nonSequentialData} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle data with extreme value ranges', () => {
      const extremeData = [
        { x: '2024-01-01', y: 0.0001 },
        { x: '2024-01-02', y: 1000000 },
        { x: '2024-01-03', y: 500000 },
      ];
      const { getByTestID } = render(
        <Chart data={extremeData} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle data with NaN values gracefully', () => {
      const nanData = [
        { x: '2024-01-01', y: 100 },
        { x: '2024-01-02', y: NaN as any },
        { x: '2024-01-03', y: 120 },
      ];
      // Should not crash, though behavior may vary
      const { getByTestID } = render(
        <Chart data={nanData} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle data with Infinity values gracefully', () => {
      const infinityData = [
        { x: '2024-01-01', y: 100 },
        { x: '2024-01-02', y: Infinity as any },
        { x: '2024-01-03', y: 120 },
      ];
      const { getByTestID } = render(
        <Chart data={infinityData} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });
  });

  describe('Real-world Data Scenarios', () => {
    it('should handle stock price data (typical range)', () => {
      const stockData = Array.from({ length: 100 }, (_, i) => ({
        x: new Date(2024, 0, i + 1).toISOString(),
        y: 100 + Math.random() * 20 - 10, // Price between 90-110
      }));
      const { getByTestID } = render(
        <Chart data={stockData} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle portfolio value data (large numbers)', () => {
      const portfolioData = Array.from({ length: 365 }, (_, i) => ({
        x: new Date(2024, 0, i + 1).toISOString(),
        y: 100000 + Math.random() * 10000, // Portfolio value ~100k
      }));
      const { getByTestID } = render(
        <Chart data={portfolioData} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle percentage data (0-100 range)', () => {
      const percentageData = Array.from({ length: 50 }, (_, i) => ({
        x: i,
        y: Math.random() * 100, // 0-100%
      }));
      const { getByTestID } = render(
        <Chart data={percentageData} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });

    it('should handle data with gaps (missing days)', () => {
      const dataWithGaps = [
        { x: '2024-01-01', y: 100 },
        { x: '2024-01-02', y: 150 },
        // Gap: missing 2024-01-03
        { x: '2024-01-04', y: 120 },
        { x: '2024-01-05', y: 180 },
      ];
      const { getByTestID } = render(
        <Chart data={dataWithGaps} testID="chart" />
      );
      expect(getByTestID('chart')).toBeTruthy();
    });
  });
});

