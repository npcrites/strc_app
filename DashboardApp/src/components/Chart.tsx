import React from 'react';
import { VictoryLine, VictoryChart, VictoryAxis } from 'victory-native';

interface ChartProps {
  data: { x: string | number; y: number }[];
}

export default function Chart({ data }: ChartProps) {
  return (
    <VictoryChart>
      <VictoryAxis />
      <VictoryAxis dependentAxis />
      <VictoryLine data={data} />
    </VictoryChart>
  );
}

