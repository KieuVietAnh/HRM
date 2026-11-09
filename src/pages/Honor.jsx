function Honor() {
  const honorUrl = "https://quantrinhansu123.github.io/VinhdanhLumi.html/"

  return (
    <div style={{
      width: '100%',
      height: 'calc(100vh - 80px)',
      padding: '0',
      margin: '0',
      overflow: 'hidden'
    }}>
      <iframe
        src={honorUrl}
        title="Tôn vinh"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block'
        }}
        allowFullScreen
      />
    </div>
  )
}

export default Honor
