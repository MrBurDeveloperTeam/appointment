export default function Badge({ children, variant = '' }) {
  const classes = ['badge', variant].filter(Boolean).join(' ');
  return <span className={classes}>{children}</span>;
}
