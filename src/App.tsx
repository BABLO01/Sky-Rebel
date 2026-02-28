/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Stage, Layer, Rect, Circle, Text, Group } from 'react-konva';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Settings, RotateCcw, Home, Shield, Zap, Flame, Wind, Info, X } from 'lucide-react';
import confetti from 'canvas-confetti';

// --- Constants & Types ---

const GRAVITY = 0.4;
const JUMP_FORCE = -8;
const GAME_SPEED_BASE = 5;
const PLAYER_SIZE = 40;
const OBSTACLE_WIDTH = 60;
const POWERUP_SIZE = 30;

type GameState = 'START' | 'PLAYING' | 'PAUSED' | 'PHOENIX_REVIVE' | 'GAME_OVER';

interface Entity {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Obstacle extends Entity {
  type: 'DRONE' | 'LASER' | 'STORM' | 'WIRE';
  speed: number;
}

interface PowerUp extends Entity {
  type: 'FIRE_WINGS' | 'WIND_GLIDE' | 'SHIELD' | 'PHOENIX';
}

interface Boss extends Entity {
  health: number;
  maxHealth: number;
  active: boolean;
  phase: number;
}

interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface Projectile extends Entity {
  vx: number;
  vy: number;
}

interface Challenge {
  id: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  rewardSkin: string;
}

// --- Main Component ---

export default function App() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  
  // Player State
  const [playerY, setPlayerY] = useState(window.innerHeight / 2);
  const [playerVelocity, setPlayerVelocity] = useState(0);
  const [isPhoenixMode, setIsPhoenixMode] = useState(false);
  const [activePowerUps, setActivePowerUps] = useState<Record<string, number>>({});
  
  // World State
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [powerUps, setPowerUps] = useState<PowerUp[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [backgroundOffset, setBackgroundOffset] = useState(0);
  const [boss, setBoss] = useState<Boss | null>(null);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [currentSkin, setCurrentSkin] = useState('DEFAULT');
  const [unlockedSkins, setUnlockedSkins] = useState(['DEFAULT']);
  const [challenges, setChallenges] = useState<Challenge[]>([
    {
      id: 'CHALLENGE_1',
      description: 'Survive 500m without dying',
      target: 500,
      progress: 0,
      completed: false,
      rewardSkin: 'ICE',
    }
  ]);

  const [showAbout, setShowAbout] = useState(false);

  const requestRef = useRef<number>(undefined);
  const lastTimeRef = useRef<number>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Initialization ---

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Game Logic ---

  const spawnObstacle = useCallback(() => {
    const types: Obstacle['type'][] = ['DRONE', 'LASER', 'STORM', 'WIRE'];
    const type = types[Math.floor(Math.random() * types.length)];
    const newObstacle: Obstacle = {
      id: Math.random().toString(),
      x: dimensions.width + 100,
      y: Math.random() * (dimensions.height - 100) + 50,
      width: OBSTACLE_WIDTH,
      height: type === 'LASER' ? 200 : 60,
      type,
      speed: GAME_SPEED_BASE + (score / 500),
    };
    setObstacles(prev => [...prev, newObstacle]);
  }, [dimensions, score]);

  const spawnPowerUp = useCallback(() => {
    const types: PowerUp['type'][] = ['FIRE_WINGS', 'WIND_GLIDE', 'SHIELD', 'PHOENIX'];
    const type = types[Math.floor(Math.random() * types.length)];
    const newPowerUp: PowerUp = {
      id: Math.random().toString(),
      x: dimensions.width + 100,
      y: Math.random() * (dimensions.height - 100) + 50,
      width: POWERUP_SIZE,
      height: POWERUP_SIZE,
      type,
    };
    setPowerUps(prev => [...prev, newPowerUp]);
  }, [dimensions]);

  const spawnBoss = useCallback(() => {
    const newBoss: Boss = {
      id: 'BOSS_1',
      x: dimensions.width + 200,
      y: dimensions.height / 2 - 100,
      width: 200,
      height: 200,
      health: 100,
      maxHealth: 100,
      active: true,
      phase: 1,
    };
    setBoss(newBoss);
    setObstacles([]); // Clear obstacles for boss fight
  }, [dimensions]);

  const createExplosion = (x: number, y: number, color: string) => {
    const newParticles: Particle[] = Array.from({ length: 15 }).map(() => ({
      id: Math.random().toString(),
      x,
      y,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      life: 1,
      color,
      size: Math.random() * 5 + 2,
    }));
    setParticles(prev => [...prev, ...newParticles]);
  };

  const handleDeath = () => {
    if (activePowerUps['SHIELD']) {
      setActivePowerUps(prev => {
        const next = { ...prev };
        delete next['SHIELD'];
        return next;
      });
      createExplosion(50, playerY, '#3b82f6');
      return;
    }

    if (activePowerUps['PHOENIX'] || !isPhoenixMode) {
      setGameState('PHOENIX_REVIVE');
      setIsPhoenixMode(true);
      createExplosion(50, playerY, '#ef4444');
      
      setTimeout(() => {
        setGameState('PLAYING');
        setTimeout(() => setIsPhoenixMode(false), 5000);
      }, 1000);
    } else {
      setGameState('GAME_OVER');
      if (score > highScore) setHighScore(score);
    }
  };

  const update = useCallback((time: number) => {
    if (gameState !== 'PLAYING') return;

    if (lastTimeRef.current !== undefined) {
      const deltaTime = (time - lastTimeRef.current) / 16;
      const currentSpeed = (isPhoenixMode ? GAME_SPEED_BASE * 2 : GAME_SPEED_BASE) + (score / 1000);

      // Update Player
      setPlayerVelocity(v => v + GRAVITY * deltaTime);
      setPlayerY(y => {
        const nextY = y + playerVelocity * deltaTime;
        if (nextY < 0 || nextY > dimensions.height - PLAYER_SIZE) {
          handleDeath();
          return y;
        }
        return nextY;
      });

      // Update World
      setBackgroundOffset(prev => (prev - currentSpeed * 0.5) % dimensions.width);
      
      setProjectiles(prev => {
        const next = prev.map(p => ({ ...p, x: p.x + p.vx }))
          .filter(p => p.x < dimensions.width + 100);
        
        // Collision with boss
        if (boss && boss.active) {
          next.forEach((p, idx) => {
            if (
              p.x < boss.x + boss.width &&
              p.x + p.width > boss.x &&
              p.y < boss.y + boss.height &&
              p.y + p.height > boss.y
            ) {
              setBoss(b => b ? { ...b, health: Math.max(0, b.health - 5) } : null);
              createExplosion(p.x, p.y, '#f97316');
              // Mark for removal
              p.x = 10000; 
            }
          });
        }

        return next.filter(p => p.x < dimensions.width);
      });

      setObstacles(prev => {
        const next = prev.map(o => ({ ...o, x: o.x - currentSpeed * deltaTime }))
          .filter(o => o.x > -100);
        
        // Collision Detection
        next.forEach(o => {
          if (
            50 < o.x + o.width &&
            50 + PLAYER_SIZE > o.x &&
            playerY < o.y + o.height &&
            playerY + PLAYER_SIZE > o.y
          ) {
            if (activePowerUps['FIRE_WINGS']) {
              createExplosion(o.x, o.y, '#f97316');
              // Remove this obstacle (handled by filter in next frame or better logic)
            } else if (!activePowerUps['WIND_GLIDE']) {
              handleDeath();
            }
          }
        });

        return next;
      });

      setPowerUps(prev => {
        const next = prev.map(p => ({ ...p, x: p.x - currentSpeed * deltaTime }))
          .filter(p => p.x > -100);

        next.forEach(p => {
          if (
            50 < p.x + p.width &&
            50 + PLAYER_SIZE > p.x &&
            playerY < p.y + p.height &&
            playerY + PLAYER_SIZE > p.y
          ) {
            setActivePowerUps(prevActive => ({ ...prevActive, [p.type]: 10000 }));
            createExplosion(p.x, p.y, '#fbbf24');
          }
        });

        return next;
      });

      setParticles(prev => prev.map(p => ({
        ...p,
        x: p.x + p.vx,
        y: p.y + p.vy,
        life: p.life - 0.02,
      })).filter(p => p.life > 0));

      setScore(s => {
        const nextScore = s + 1;
        if (nextScore % 1000 === 0 && !boss) {
          spawnBoss();
        }
        
        // Update Challenges
        setChallenges(prev => prev.map(c => {
          if (!c.completed && !isPhoenixMode) {
            const nextProgress = nextScore / 10;
            if (nextProgress >= c.target) {
              setUnlockedSkins(skins => [...new Set([...skins, c.rewardSkin])]);
              return { ...c, progress: c.target, completed: true };
            }
            return { ...c, progress: nextProgress };
          }
          return c;
        }));

        return nextScore;
      });

      // Boss Logic
      if (boss && boss.active) {
        setBoss(prev => {
          if (!prev) return null;
          let nextX = prev.x;
          let nextY = prev.y;

          // Boss movement
          if (prev.x > dimensions.width - 250) {
            nextX -= 2;
          } else {
            nextY += Math.sin(time / 500) * 3;
          }

          // Boss shooting
          if (Math.random() < 0.05) {
            const bossLaser: Obstacle = {
              id: Math.random().toString(),
              x: prev.x,
              y: prev.y + prev.height / 2,
              width: 100,
              height: 10,
              type: 'LASER',
              speed: 10,
            };
            setObstacles(o => [...o, bossLaser]);
          }

          // Boss death
          if (prev.health <= 0) {
            createExplosion(prev.x + prev.width/2, prev.y + prev.height/2, '#ef4444');
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 }
            });
            return null;
          }

          return { ...prev, x: nextX, y: nextY };
        });
      }

      // Shooting logic for player
      if (activePowerUps['FIRE_WINGS'] && Math.random() < 0.1) {
        const newProjectile: Projectile = {
          id: Math.random().toString(),
          x: 50 + PLAYER_SIZE,
          y: playerY,
          width: 20,
          height: 10,
          vx: 15,
          vy: 0,
        };
        setProjectiles(p => [...p, newProjectile]);
      }

      // Spawning
      if (Math.random() < 0.02 && !boss) spawnObstacle();
      if (Math.random() < 0.005) spawnPowerUp();
    }
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(update);
  }, [gameState, playerVelocity, dimensions, score, isPhoenixMode, activePowerUps, spawnObstacle, spawnPowerUp, playerY]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [update]);

  // --- Input Handling ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        handleJump();
      }
      if (e.code === 'Escape' && gameState === 'PLAYING') {
        setGameState('PAUSED');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  const handleJump = () => {
    if (gameState === 'PLAYING') {
      setPlayerVelocity(JUMP_FORCE);
    } else if (gameState === 'START') {
      startGame();
    }
  };

  const startGame = () => {
    setScore(0);
    setPlayerY(dimensions.height / 2);
    setPlayerVelocity(0);
    setObstacles([]);
    setPowerUps([]);
    setParticles([]);
    setProjectiles([]);
    setActivePowerUps({});
    setIsPhoenixMode(false);
    setBoss(null);
    setGameState('PLAYING');
  };

  // --- Render Helpers ---

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen overflow-hidden bg-slate-950 font-sans select-none"
      onMouseDown={handleJump}
      onTouchStart={handleJump}
    >
      {/* Game Canvas */}
      <Stage width={dimensions.width} height={dimensions.height}>
        <Layer>
          {/* Background Elements (Parallax) */}
          <Group x={backgroundOffset}>
            <Circle x={200} y={100} radius={80} fill="rgba(255,255,255,0.05)" />
            <Circle x={800} y={400} radius={120} fill="rgba(255,255,255,0.03)" />
            <Circle x={1400} y={200} radius={60} fill="rgba(255,255,255,0.04)" />
          </Group>
          <Group x={backgroundOffset + dimensions.width}>
            <Circle x={200} y={100} radius={80} fill="rgba(255,255,255,0.05)" />
          </Group>

          {/* Boss */}
          {boss && boss.active && (
            <Group x={boss.x} y={boss.y}>
              <Rect
                width={boss.width}
                height={boss.height}
                fill="#1e293b"
                stroke="#ef4444"
                strokeWidth={4}
                cornerRadius={20}
                shadowBlur={20}
                shadowColor="#ef4444"
              />
              <Rect
                x={20}
                y={-30}
                width={boss.width - 40}
                height={10}
                fill="#ef4444"
                scaleX={boss.health / boss.maxHealth}
              />
              <Text 
                text="BOSS" 
                fontSize={24} 
                fill="white" 
                x={boss.width / 2 - 30} 
                y={boss.height / 2 - 12} 
                fontStyle="black italic" 
              />
            </Group>
          )}

          {/* Projectiles */}
          {projectiles.map(p => (
            <Rect
              key={p.id}
              x={p.x}
              y={p.y}
              width={p.width}
              height={p.height}
              fill="#f97316"
              cornerRadius={5}
              shadowBlur={10}
              shadowColor="#f97316"
            />
          ))}

          {/* Obstacles */}
          {obstacles.map(o => (
            <Rect
              key={o.id}
              x={o.x}
              y={o.y}
              width={o.width}
              height={o.height}
              fill={o.type === 'LASER' ? '#ef4444' : '#475569'}
              shadowBlur={o.type === 'LASER' ? 15 : 0}
              shadowColor="#ef4444"
              cornerRadius={4}
            />
          ))}

          {/* PowerUps */}
          {powerUps.map(p => (
            <Group key={p.id} x={p.x} y={p.y}>
              <Circle radius={POWERUP_SIZE/2} fill="#fbbf24" shadowBlur={10} shadowColor="#fbbf24" />
              <Text 
                text={p.type[0]} 
                fontSize={16} 
                fill="white" 
                x={-5} 
                y={-8} 
                fontStyle="bold" 
              />
            </Group>
          ))}

          {/* Particles */}
          {particles.map(p => (
            <Circle
              key={p.id}
              x={p.x}
              y={p.y}
              radius={p.size}
              fill={p.color}
              opacity={p.life}
            />
          ))}

          {/* Player */}
          <Group x={50} y={playerY}>
            {/* Phoenix Aura */}
            {isPhoenixMode && (
              <Circle 
                radius={PLAYER_SIZE * 0.8} 
                fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                fillRadialGradientStartRadius={0}
                fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                fillRadialGradientEndRadius={PLAYER_SIZE * 0.8}
                fillRadialGradientColorStops={[0, '#ef4444', 1, 'transparent']}
                opacity={0.6}
              />
            )}
            {/* Shield */}
            {activePowerUps['SHIELD'] && (
              <Circle 
                radius={PLAYER_SIZE * 0.7} 
                stroke="#3b82f6" 
                strokeWidth={3} 
                dash={[5, 5]}
              />
            )}
            {/* Player Body */}
            <Rect
              width={PLAYER_SIZE}
              height={PLAYER_SIZE}
              fill={
                isPhoenixMode ? '#ef4444' : 
                currentSkin === 'ICE' ? '#7dd3fc' :
                currentSkin === 'NEON' ? '#4ade80' :
                currentSkin === 'DRAGON' ? '#a855f7' :
                '#f8fafc'
              }
              cornerRadius={8}
              rotation={playerVelocity * 2}
              offsetX={PLAYER_SIZE / 2}
              offsetY={PLAYER_SIZE / 2}
              shadowBlur={10}
              shadowColor={isPhoenixMode ? '#ef4444' : '#94a3b8'}
            />
          </Group>
        </Layer>
      </Stage>

      {/* UI Overlays */}
      <AnimatePresence>
        {gameState === 'START' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm"
          >
            <motion.h1 
              initial={{ y: -50 }}
              animate={{ y: 0 }}
              className="text-8xl font-black tracking-tighter text-white mb-2 italic"
              style={{ textShadow: '0 0 40px rgba(239, 68, 68, 0.5)' }}
            >
              SKY REBEL
            </motion.h1>
            <p className="text-slate-400 mb-12 tracking-widest uppercase text-sm font-semibold">
              Endless Flight • Phoenix Protocol
            </p>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startGame}
              className="group relative px-12 py-4 bg-white text-slate-950 font-bold rounded-full overflow-hidden transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]"
            >
              <span className="relative z-10 flex items-center gap-2">
                <Play size={20} fill="currentColor" />
                START MISSION
              </span>
            </motion.button>

            <button 
              onClick={() => setShowAbout(true)}
              className="mt-4 text-slate-500 hover:text-white transition-colors text-xs font-bold tracking-widest flex items-center gap-2"
            >
              <Info size={14} />
              ABOUT MISSION
            </button>

            <div className="mt-16 grid grid-cols-2 gap-8 text-slate-500 text-xs uppercase tracking-widest">
              <div className="flex flex-col items-center gap-2">
                <span className="text-slate-300">Mobile</span>
                <span>Tap to Boost</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-slate-300">Desktop</span>
                <span>Space to Boost</span>
              </div>
            </div>

            <div className="absolute bottom-8 text-slate-600 text-[10px] tracking-[0.3em] uppercase">
              Created by Muhammad Usman
            </div>

            <AnimatePresence>
              {showAbout && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-8"
                >
                  <div className="max-w-2xl w-full">
                    <div className="flex justify-between items-center mb-8">
                      <h2 className="text-3xl font-black text-white italic">MISSION BRIEFING</h2>
                      <button onClick={() => setShowAbout(false)} className="text-slate-500 hover:text-white">
                        <X size={24} />
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-12">
                      <div>
                        <h3 className="text-emerald-500 font-bold text-xs tracking-widest uppercase mb-4">Controls</h3>
                        <div className="space-y-4 text-slate-400 text-sm">
                          <p><span className="text-white font-bold">Mobile:</span> Tap or Hold anywhere to boost altitude.</p>
                          <p><span className="text-white font-bold">Desktop:</span> Use [Space] or [Arrow Up] to boost.</p>
                          <p><span className="text-white font-bold">Pause:</span> Press [Esc] or the gear icon.</p>
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="text-orange-500 font-bold text-xs tracking-widest uppercase mb-4">Power-Ups</h3>
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-orange-500/20 rounded-lg"><Flame size={16} className="text-orange-500" /></div>
                            <span className="text-slate-300 text-xs"><span className="text-white font-bold">Fire Wings:</span> Auto-shoot projectiles.</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/20 rounded-lg"><Shield size={16} className="text-blue-500" /></div>
                            <span className="text-slate-300 text-xs"><span className="text-white font-bold">Shield:</span> Absorb one fatal impact.</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-500/20 rounded-lg"><Wind size={16} className="text-emerald-500" /></div>
                            <span className="text-slate-300 text-xs"><span className="text-white font-bold">Wind Glide:</span> Temporary invincibility.</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-12 p-6 bg-white/5 rounded-2xl border border-white/10">
                      <h3 className="text-red-500 font-bold text-xs tracking-widest uppercase mb-2">Phoenix Protocol</h3>
                      <p className="text-slate-400 text-sm leading-relaxed">
                        Upon fatal collision, the Phoenix Protocol initiates an instant revive. You gain double speed and invulnerability for 5 seconds. Use this window to escape danger zones.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Skin Selector */}
            <div className="absolute top-8 left-8 flex flex-col gap-2">
              <span className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Select Skin</span>
              <div className="flex gap-2">
                {unlockedSkins.map(skin => (
                  <button
                    key={skin}
                    onClick={() => setCurrentSkin(skin)}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                      currentSkin === skin ? 'bg-white text-slate-950' : 'bg-white/5 text-slate-500 hover:bg-white/10'
                    }`}
                  >
                    {skin}
                  </button>
                ))}
              </div>
            </div>

            {/* Challenges Display */}
            <div className="absolute top-8 right-8 flex flex-col gap-2 items-end">
              <span className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Challenges</span>
              {challenges.map(c => (
                <div key={c.id} className="bg-white/5 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10 min-w-[200px]">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-white font-bold uppercase tracking-tighter">{c.description}</span>
                    <span className="text-[10px] text-slate-400">{c.completed ? 'DONE' : `${Math.floor(c.progress)}/${c.target}m`}</span>
                  </div>
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-500" 
                      style={{ width: `${(c.progress / c.target) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {gameState === 'PLAYING' && (
          <div className="absolute top-8 left-0 w-full px-8 flex justify-between items-start pointer-events-none">
            <div className="flex flex-col">
              <span className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Altitude</span>
              <span className="text-4xl font-mono font-bold text-white leading-none">{Math.floor(score / 10)}m</span>
            </div>
            
            <div className="flex gap-4">
              {Object.entries(activePowerUps).map(([type, time]) => (
                <div key={type} className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                  {type === 'SHIELD' && <Shield size={14} className="text-blue-400" />}
                  {type === 'FIRE_WINGS' && <Flame size={14} className="text-orange-400" />}
                  {type === 'WIND_GLIDE' && <Wind size={14} className="text-emerald-400" />}
                  {type === 'PHOENIX' && <Zap size={14} className="text-red-400" />}
                  <span className="text-[10px] font-bold text-white uppercase tracking-tighter">{type.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {gameState === 'PHOENIX_REVIVE' && (
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="text-center">
              <h2 className="text-6xl font-black text-red-500 italic mb-2">PHOENIX REVIVE</h2>
              <p className="text-white/50 uppercase tracking-[0.5em] text-sm">Protocol Initiated</p>
            </div>
          </motion.div>
        )}

        {gameState === 'GAME_OVER' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/90 backdrop-blur-md"
          >
            <h2 className="text-7xl font-black text-white mb-2 italic">MISSION FAILED</h2>
            <p className="text-red-300 mb-12 tracking-widest uppercase text-sm">Signal Lost • Final Altitude: {Math.floor(score / 10)}m</p>
            
            <div className="flex gap-4">
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-8 py-3 bg-white text-slate-950 font-bold rounded-full hover:scale-105 transition-transform"
              >
                <RotateCcw size={18} />
                RETRY
              </button>
              <button
                onClick={() => setGameState('START')}
                className="flex items-center gap-2 px-8 py-3 bg-white/10 text-white font-bold rounded-full border border-white/20 hover:bg-white/20 transition-all"
              >
                <Home size={18} />
                MENU
              </button>
            </div>

            {score >= highScore && score > 0 && (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-8 text-yellow-400 font-bold tracking-widest text-sm"
              >
                NEW RECORD ESTABLISHED
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings/Pause Trigger */}
      {gameState === 'PLAYING' && (
        <button 
          onClick={(e) => { e.stopPropagation(); setGameState('PAUSED'); }}
          className="absolute top-8 right-8 p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 transition-colors pointer-events-auto"
        >
          <Settings size={20} className="text-slate-400" />
        </button>
      )}

      {gameState === 'PAUSED' && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md z-50"
        >
          <h2 className="text-5xl font-black text-white mb-12 italic">PAUSED</h2>
          <div className="flex flex-col gap-4 w-64">
            <button
              onClick={() => setGameState('PLAYING')}
              className="w-full py-4 bg-white text-slate-950 font-bold rounded-xl hover:scale-105 transition-transform"
            >
              RESUME
            </button>
            <button
              onClick={startGame}
              className="w-full py-4 bg-white/10 text-white font-bold rounded-xl border border-white/20 hover:bg-white/20 transition-all"
            >
              RESTART
            </button>
            <button
              onClick={() => setGameState('START')}
              className="w-full py-4 bg-white/10 text-white font-bold rounded-xl border border-white/20 hover:bg-white/20 transition-all"
            >
              QUIT
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
