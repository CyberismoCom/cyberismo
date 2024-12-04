/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { MacroContext } from '.';
import React from 'react';

export type CreateCardsProps = {
  title?: string;
  value: number;
  unit?: string;
  legend?: string;
} & MacroContext;

export default function ScoreCard({
  title,
  value,
  unit,
  legend,
}: CreateCardsProps) {
  const cardStyle = {
    backgroundColor: '#ffffff',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    display: 'inline-block',
    padding: '20px',
    marginTop: '20px',
    marginRight: '20px',
  };

  const titleStyle = {
    fontSize: '16px',
    color: '#666666',
    margin: '0',
    marginBottom: '4px',
  };

  const valueStyle = {
    fontSize: '48px',
    fontWeight: 'bold',
    color: '#333333',
    margin: '0',
  };

  const unitStyle = {
    fontSize: '24px',
  };

  const legendStyle = {
    fontSize: '14px',
    color: '#999999',
    marginTop: '4px',
  };

  return (
    <div style={cardStyle}>
      <p style={titleStyle}>{title}</p>
      <p style={valueStyle}>
        {value}
        <span style={unitStyle}>{unit}</span>
      </p>
      <p style={legendStyle}>{legend}</p>
    </div>
  );
}
