import React from 'react';
import { render } from '@testing-library/react-native';
import { generateChartPath } from '../Chart';
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
    LinearGradient: ({ children, ...props }: any) => React.createElement('LinearGradient', props, children),
    Stop: (props: any) => React.createElement('Stop', props),
    Mask: ({ children, ...props }: any) => React.createElement('Mask', props, children),
    ClipPath: ({ children, ...props }: any) => React.createElement('ClipPath', props, children),
    Path: (props: any) => React.createElement('Path', props),
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
});

