/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { Heart, RefreshCw, X } from 'lucide-react';
import React, { useEffect,useMemo, useRef, useState } from 'react';

import { useTranslation } from '@/i18n';
import { Button } from '@/shared/ui/Button';
import { normalizeRoleId } from '@/shared/utils/characterKinds';
import { roleLabel } from '@/shared/utils/displayLabels';

import { type Character } from '../../../shared/types';

interface RelationshipDiagramProps {
  characters: Character[];
  onClose: () => void;
}

interface NodePosition {
  x: number;
  y: number;
}

const RelationshipDiagram: React.FC<RelationshipDiagramProps> = ({ characters, onClose }) => {
  const { t } = useTranslation('characters');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});
  const svgRef = useRef<SVGSVGElement>(null);

  // 自动检测关系连线
  const links = useMemo(() => {
    const result: { source: string; target: string; description: string }[] = [];
    characters.forEach(char => {
      characters.forEach(other => {
        if (char.id === other.id) return;
        // 检查关系文本中是否提到了对方的名字
        if (char.relationships.includes(other.name)) {
          result.push({
            source: char.id,
            target: other.id,
            description: char.relationships
          });
        }
      });
    });
    return result;
  }, [characters]);

  // 计算初始圆形布局
  const initialLayout = useMemo(() => {
    const radius = Math.min(window.innerWidth, window.innerHeight) * 0.3;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    const positions: Record<string, NodePosition> = {};
    characters.forEach((char, i) => {
      const angle = (i / characters.length) * 2 * Math.PI;
      positions[char.id] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      };
    });
    return positions;
  }, [characters]);

  // 初始化或重置节点位置
  useEffect(() => {
    if (Object.keys(nodePositions).length === 0 && characters.length > 0) {
      setNodePositions(initialLayout);
    }
  }, [characters, initialLayout, nodePositions]);

  // 拖拽事件处理
  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setDraggingId(nodeId);
    // 防止文本选中
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingId || !svgRef.current) return;

    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    // 更新被拖拽节点的位置
    setNodePositions(prev => ({
      ...prev,
      [draggingId]: {
        x: svgP.x,
        y: svgP.y
      }
    }));
  };

  const handleMouseUp = () => {
    setDraggingId(null);
  };

  const handleMouseLeave = () => {
    setDraggingId(null);
  };

  // 重置布局到圆形
  const resetLayout = () => {
    setNodePositions({});
  };

  // 组合节点数据（包含位置信息）
  const nodes = useMemo(() => {
    return characters.map(char => {
      // 优先使用拖拽后的位置，否则使用初始布局
      const position = nodePositions[char.id] || initialLayout[char.id] || { x: 0, y: 0 };
      return {
        ...char,
        x: position.x,
        y: position.y
      };
    });
  }, [characters, nodePositions, initialLayout]);

  const selectedChar = nodes.find(n => n.id === selectedId);

  const getRoleColor = (role: string) => {
    switch (normalizeRoleId(role, 'other')) {
      case 'protagonist': return 'var(--color-chart-2)'; // Amber
      case 'antagonist': return 'var(--color-chart-3)'; // Red
      case 'supporting': return 'var(--color-chart-1)'; // Blue
      default: return 'var(--color-chart-gray)'; // Gray
    }
  };

  return (
    <div className="fixed inset-0 z-overlay flex items-center justify-center overflow-hidden bg-background">
      <header className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between p-6">
        <div>
          <h2 className="font-serif text-2xl font-medium tracking-tight text-foreground">{t('diagram.title')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('diagram.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetLayout} title={t('diagram.resetTitle')}>
            <RefreshCw className="size-4" />
            {t('diagram.reset')}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('diagram.close')} title={t('diagram.close')}>
            <X className="size-4" />
          </Button>
        </div>
      </header>

      {/* SVG 绘图区域 */}
      <svg
        ref={svgRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* 绘制连线 */}
        {links.map((link, i) => {
          const source = nodes.find(n => n.id === link.source);
          const target = nodes.find(n => n.id === link.target);
          if (!source || !target) return null;

          const isRelatedToSelected = selectedId === link.source || selectedId === link.target;

          return (
            <line
              key={i}
              x1={source.x} y1={source.y}
              x2={target.x} y2={target.y}
              stroke={isRelatedToSelected ? 'var(--primary)' : 'var(--border)'}
              strokeWidth={isRelatedToSelected ? 2 : 1}
              strokeDasharray={isRelatedToSelected ? '0' : '5,5'}
              className="transition-all duration-500"
              opacity={selectedId ? (isRelatedToSelected ? 1 : 0.15) : 0.5}
            />
          );
        })}

        {/* 绘制节点 */}
        {nodes.map((node) => (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            className={`transition-all duration-500 ${draggingId === node.id ? 'cursor-grabbing' : 'cursor-move'}`}
            onClick={() => {
              // 如果正在拖拽，不触发点击选中
              if (!draggingId) {
                setSelectedId(node.id === selectedId ? null : node.id);
              }
            }}
            onMouseDown={(e) => handleMouseDown(e, node.id)}
            style={{
              opacity: selectedId ? (selectedId === node.id || links.some(l => (l.source === node.id && l.target === selectedId) || (l.target === node.id && l.source === selectedId)) ? 1 : 0.2) : 1,
              pointerEvents: draggingId && draggingId !== node.id ? 'none' : 'auto'
            }}
          >
            <circle
              r={selectedId === node.id ? 45 : 35}
              fill={getRoleColor(node.role)}
              filter={selectedId === node.id ? 'url(#glow)' : ''}
              className="transition-all"
            />
            <circle
              r={selectedId === node.id ? 40 : 30}
              fill="var(--card)"
            />
            <text
              dy=".3em"
              textAnchor="middle"
              fill="var(--foreground)"
              className="select-none text-2xs font-medium pointer-events-none"
            >
              {node.name}
            </text>
            <text
              y="50"
              textAnchor="middle"
              fill={getRoleColor(node.role)}
              className="select-none text-2xs uppercase opacity-70 pointer-events-none"
            >
              {roleLabel(node.role)}
            </text>
          </g>
        ))}
      </svg>

      {/* 侧边信息卡片 */}
      {selectedChar && (
        <div className="absolute bottom-8 right-8 top-28 flex w-80 flex-col rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg">
          <div className="mb-5">
            <span
              className="mb-2 inline-block rounded px-2 py-0.5 text-2xs font-medium uppercase"
              style={{
                backgroundColor: `color-mix(in srgb, ${getRoleColor(selectedChar.role)} 15%, transparent)`,
                color: getRoleColor(selectedChar.role),
              }}
            >
              {roleLabel(selectedChar.role)}
            </span>
            <h3 className="font-serif text-2xl font-medium">{selectedChar.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('diagram.ageLabel', { age: selectedChar.age })}</p>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto pr-1">
            <div>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Heart className="size-3.5" /> {t('diagram.relationsTitle')}
              </h4>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {selectedChar.relationships || t('diagram.noRelations')}
              </p>
            </div>

            <div>
              <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('diagram.graphExplain')}</h4>
              <ul className="space-y-1.5">
                {links.filter(l => l.source === selectedId).map((link, i) => {
                  const target = nodes.find(n => n.id === link.target);
                  return (
                    <li key={i} className="rounded-md border border-border bg-muted/40 p-2.5 text-xs">
                      <span className="font-medium text-foreground">→ {target?.name}</span>
                      <p className="mt-0.5 text-muted-foreground">{t('diagram.hasIntersection')}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => setSelectedId(null)}>
            {t('diagram.backToOverview')}
          </Button>
        </div>
      )}

      {/* 操作提示 */}
      {!selectedId && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full border border-border bg-card/80 px-5 py-2 text-xs text-muted-foreground backdrop-blur-sm">
          {draggingId ? t('diagram.hintDragging') : t('diagram.hintIdle')}
        </div>
      )}
    </div>
  );
};

export default RelationshipDiagram;






