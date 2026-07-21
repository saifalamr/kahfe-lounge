'use client'
import { motion } from 'motion/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

// Subtle, professional press feedback for the admin panel's high-visibility
// buttons. Deliberately understated: a gentle scale-down on press with a soft
// spring back - the kind of "feels alive" touch that reads as premium without
// being distracting on a POS someone uses hundreds of times a shift.
//
// Drop-in for a normal <button>: it forwards every prop (style, onClick,
// disabled, title, children...) so an existing inline-styled button can be
// upgraded by just changing the tag - no style rewrite. Disabled buttons get
// no press animation, as expected.
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }

export default function MotionButton({ children, disabled, ...rest }: Props) {
  return (
    <motion.button
      {...(rest as any)}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {children}
    </motion.button>
  )
}
