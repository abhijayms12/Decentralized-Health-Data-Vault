import { motion } from 'framer-motion';

export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Optimized Blob 1 - Top Left */}
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(20, 184, 166, 0.22) 0%, rgba(20, 184, 166, 0.12) 40%, transparent 70%)',
          top: '-10%',
          left: '-10%',
          filter: 'blur(50px)',
          willChange: 'transform',
        }}
        animate={{
          x: [0, 30, 0],
          y: [0, -20, 0],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Optimized Blob 2 - Top Right */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.18) 0%, rgba(99, 102, 241, 0.10) 40%, transparent 70%)',
          top: '-15%',
          right: '-15%',
          filter: 'blur(50px)',
          willChange: 'transform',
        }}
        animate={{
          x: [0, -40, 0],
          y: [0, 30, 0],
        }}
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Optimized Blob 3 - Bottom */}
      <motion.div
        className="absolute w-[550px] h-[550px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(6, 182, 212, 0.20) 0%, rgba(6, 182, 212, 0.11) 40%, transparent 70%)',
          bottom: '-15%',
          right: '10%',
          filter: 'blur(50px)',
          willChange: 'transform',
        }}
        animate={{
          x: [0, -25, 0],
          y: [0, 25, 0],
        }}
        transition={{
          duration: 28,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Floating Bubble 1 - Small Teal */}
      <motion.div
        className="absolute w-40 h-40 rounded-full border border-teal-300/30"
        style={{
          background: 'radial-gradient(circle at 30% 30%, rgba(20, 184, 166, 0.18), rgba(20, 184, 166, 0.04))',
          top: '15%',
          left: '20%',
          boxShadow: 'inset 0 0 40px rgba(20, 184, 166, 0.15)',
        }}
        animate={{
          y: [0, -80, 0],
          x: [0, 60, 0],
          scale: [1, 1.15, 1],
          rotate: [0, 180, 360],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Floating Bubble 2 - Medium Blue */}
      <motion.div
        className="absolute w-56 h-56 rounded-full border border-blue-300/30"
        style={{
          background: 'radial-gradient(circle at 30% 30%, rgba(59, 130, 246, 0.18), rgba(59, 130, 246, 0.04))',
          top: '60%',
          right: '15%',
          boxShadow: 'inset 0 0 50px rgba(59, 130, 246, 0.15)',
        }}
        animate={{
          y: [0, 100, 0],
          x: [0, -70, 0],
          scale: [1, 1.2, 1],
          rotate: [0, -180, -360],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Floating Bubble 3 - Small Cyan */}
      <motion.div
        className="absolute w-48 h-48 rounded-full border border-cyan-300/20"
        style={{
          background: 'radial-gradient(circle at 30% 30%, rgba(6, 182, 212, 0.18), rgba(6, 182, 212, 0.04))',
          bottom: '25%',
          left: '10%',
          boxShadow: 'inset 0 0 45px rgba(6, 182, 212, 0.15)',
        }}
        animate={{
          y: [0, -90, 0],
          x: [0, 65, 0],
          scale: [1, 1.18, 1],
          rotate: [0, 180, 360],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Floating Bubble 4 - Large Indigo */}
      <motion.div
        className="absolute w-64 h-64 rounded-full border border-indigo-300/20"
        style={{
          background: 'radial-gradient(circle at 30% 30%, rgba(99, 102, 241, 0.18), rgba(99, 102, 241, 0.04))',
          top: '35%',
          right: '25%',
          boxShadow: 'inset 0 0 60px rgba(99, 102, 241, 0.15)',
        }}
        animate={{
          y: [0, -110, 0],
          x: [0, -80, 0],
          scale: [1, 1.25, 1],
          rotate: [0, -180, -360],
        }}
        transition={{
          duration: 28,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
}
