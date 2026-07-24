import React, { useState, useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { Calendar, Clock, RefreshCw, Download, Share2, X } from 'lucide-react';

const PAGE_SIZE = 6;
const HEADER_LOGO = "https://static.wixstatic.com/media/c68ee5_fd1fc8ce603c4084ace453685d3c642c~mv2.jpg/v1/fill/w_311,h_150,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Prancheta%201%20c%C3%B3pia%202%20-%20Copia.jpg";

// Componente para renderizar cada player individualmente com suporte a Blob e URL direta
function VideoPlayer({ videoUrl, videoName }) {
    const [src, setSrc] = useState(videoUrl);
    const [hasError, setHasError] = useState(false);

    const handleError = async () => {
        if (hasError) return;
        setHasError(true);
        try {
            const path = videoUrl.includes('/videos/') ? `videos/${videoName}` : videoName;
            const { data, error } = await supabase.storage.from('replays').download(path);
            if (data && !error) {
                const blobUrl = URL.createObjectURL(data);
                setSrc(blobUrl);
            }
        } catch (e) {
            console.error("Erro ao carregar vídeo via Blob:", e);
        }
    };

    return (
        <video
            key={src}
            controls
            playsInline
            preload="metadata"
            src={src}
            onError={handleError}
            style={styles.video}
        >
            Seu navegador não suporta a exibição deste vídeo.
        </video>
    );
}

// Busca replays filtrando exclusivamente por um único dia
const fetchReplays = async ({ pageParam = 0, queryKey }) => {
    const [_, { selectedDate }] = queryKey;

    let { data, error } = await supabase.storage
        .from('replays')
        .list('videos', {
            limit: PAGE_SIZE,
            offset: pageParam,
            sortBy: { column: 'created_at', order: 'desc' },
        });

    let folderPrefix = 'videos/';

    if (!data || data.length === 0) {
        const rootSearch = await supabase.storage
            .from('replays')
            .list('', {
                limit: PAGE_SIZE,
                offset: pageParam,
                sortBy: { column: 'created_at', order: 'desc' },
            });

        if (rootSearch.data && rootSearch.data.length > 0) {
            data = rootSearch.data;
            folderPrefix = '';
        }
    }

    if (error) throw error;

    // Filtra apenas o dia selecionado (de 00:00:00 até 23:59:59)
    const filteredData = (data || []).filter((file) => {
        if (file.name === '.emptyFolderPlaceholder' || !file.name.endsWith('.mp4')) return false;

        if (selectedDate) {
            const fileDate = new Date(file.created_at);

            // Define o início do dia
            const startOfDay = new Date(selectedDate);
            startOfDay.setHours(0, 0, 0, 0);

            // Define o fim do dia
            const endOfDay = new Date(selectedDate);
            endOfDay.setHours(23, 59, 59, 999);

            if (fileDate < startOfDay || fileDate > endOfDay) return false;
        }

        return true;
    });

    const formattedVideos = filteredData.map((file) => {
        const filePath = folderPrefix ? `${folderPrefix}${file.name}` : file.name;
        const { data: urlData } = supabase.storage
            .from('replays')
            .getPublicUrl(filePath);

        return {
            id: file.id || file.name,
            name: file.name,
            created_at: file.created_at,
            url: urlData.publicUrl, // <--- Use a publicUrl sem fazer replace
        };
    });

    return {
        videos: formattedVideos,
        nextPage: (data || []).length === PAGE_SIZE ? pageParam + PAGE_SIZE : undefined,
    };
};

export default function App() {
    const [selectedDate, setSelectedDate] = useState('');
    const loadMoreRef = useRef(null);

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
        isError,
    } = useInfiniteQuery({
        queryKey: ['replays', { selectedDate }],
        queryFn: fetchReplays,
        getNextPageParam: (lastPage) => lastPage.nextPage,
    });

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
                    fetchNextPage();
                }
            },
            { threshold: 0.5 }
        );

        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const handleDownload = async (url, fileName) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Erro ao baixar vídeo:', error);
            window.open(url, '_blank');
        }
    };

    const handleShare = async (video) => {
        const shareData = {
            title: 'Replay de Escalada 🧗',
            text: `Confira meu replay de escalada gravado em ${new Date(video.created_at).toLocaleDateString('pt-BR')}!`,
            url: video.url,
        };

        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Erro ao compartilhar:', err);
                }
            }
        } else {
            const waText = encodeURIComponent(`${shareData.text}\n${shareData.url}`);
            window.open(`https://api.whatsapp.com/send?text=${waText}`, '_blank');
        }
    };

    const allVideos = data?.pages.flatMap((page) => page.videos) || [];

    return (
        <div style={styles.pageWrapper}>
            {/* Reset do CSS Global para remover qualquer borda/espaço em branco padrão do navegador */}
            <style>
                {`
                    * {
                        box-sizing: border-box;
                    }
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        background-color: #c65231 !important;
                        overflow-x: hidden;
                    }
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                    .spin-icon {
                        animation: spin 1s linear infinite;
                    }
                `}
            </style>

            <div style={styles.container}>
                {/* Header */}
                <header style={styles.header}>
                    <img
                        src={HEADER_LOGO}
                        alt="Logo Escalada"
                        style={styles.logoImage}
                    />
                </header>

                {/* Filtro Estilizado por Data Única */}
                <div style={styles.filterCard}>
                    <div style={styles.filterGroup}>
                        <label style={styles.label}>
                            <Calendar size={16} /> Filtrar por dia
                        </label>
                        <div style={styles.inputContainer}>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                style={styles.input}
                            />
                            {selectedDate && (
                                <button
                                    onClick={() => setSelectedDate('')}
                                    style={styles.clearBtn}
                                    title="Limpar filtro"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Feed de Vídeos */}
                {isLoading ? (
                    <div style={styles.statusMsg}>Carregando replays...</div>
                ) : isError ? (
                    <div style={styles.statusMsg}>Erro ao carregar os vídeos.</div>
                ) : allVideos.length === 0 ? (
                    <div style={styles.statusMsg}>Nenhum replay encontrado para esta data.</div>
                ) : (
                    <div style={styles.grid}>
                        {allVideos.map((video) => (
                            <div key={video.id} style={styles.card}>
                                <div style={styles.videoWrapper}>
                                    <VideoPlayer videoUrl={video.url} videoName={video.name} />
                                </div>

                                <div style={styles.cardInfo}>
                                    {/* Data/Hora + Botões de Ação na mesma linha */}
                                    <div style={styles.cardHeaderRow}>
                                        <div style={styles.dateBadge}>
                                            <Clock size={14} />
                                            <span>
                                                {new Date(video.created_at).toLocaleString('pt-BR', {
                                                    day: '2-digit',
                                                    month: '2-digit',
                                                    year: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </span>
                                        </div>

                                        <div style={styles.iconActions}>
                                            <button
                                                onClick={() => handleDownload(video.url, video.name)}
                                                style={styles.iconBtn}
                                                title="Baixar vídeo"
                                            >
                                                <Download size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleShare(video)}
                                                style={{ ...styles.iconBtn, ...styles.shareIconBtn }}
                                                title="Compartilhar"
                                            >
                                                <Share2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Scroll Infinito */}
                <div ref={loadMoreRef} style={styles.loadMore}>
                    {isFetchingNextPage && (
                        <div style={styles.loadingMoreText}>
                            <RefreshCw size={18} className="spin-icon" /> Carregando mais vídeos...
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

const styles = {
    pageWrapper: {
        minHeight: '100vh',
        width: '100%',
        backgroundColor: '#c65231',
        margin: 0,
        padding: 0,
    },
    container: {
        maxWidth: '1000px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#fff',
    },
    header: {
        textAlign: 'center',
        marginBottom: '28px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    logoImage: {
        maxWidth: '280px',
        width: '100%',
        height: 'auto',
        borderRadius: '16px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        marginBottom: '16px',
        objectFit: 'cover',
    },
    title: {
        fontSize: '28px',
        fontWeight: '800',
        margin: '0 0 6px 0',
        color: '#ffffff',
        letterSpacing: '-0.5px',
    },
    subtitle: {
        fontSize: '14px',
        margin: '0',
        color: 'rgba(255, 255, 255, 0.85)',
    },
    filterCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '16px 20px',
        borderRadius: '20px',
        marginBottom: '28px',
        boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
        border: '1px solid rgba(255, 255, 255, 0.25)',
        maxWidth: '450px',
        marginInline: 'auto',
    },
    filterGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    label: {
        fontSize: '13px',
        fontWeight: '700',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        color: '#ffffff',
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
    },
    inputContainer: {
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
    },
    input: {
        flex: 1,
        padding: '12px 16px',
        borderRadius: '12px',
        border: 'none',
        backgroundColor: '#ffffff',
        fontSize: '15px',
        fontWeight: '500',
        color: '#1e293b',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        outline: 'none',
        cursor: 'pointer',
    },
    clearBtn: {
        padding: '12px 14px',
        borderRadius: '12px',
        border: 'none',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        color: '#fff',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '20px',
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 6px 18px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
    },
    videoWrapper: {
        backgroundColor: '#000',
        aspectRatio: '4/3',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    video: {
        width: '100%',
        height: '100%',
        objectFit: 'contain',
    },
    cardInfo: {
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
    },
    cardHeaderRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
    },
    dateBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
        fontWeight: '700',
        color: '#c65231',
    },
    iconActions: {
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
    },
    iconBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '34px',
        height: '34px',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        backgroundColor: '#f8fafc',
        color: '#334155',
        cursor: 'pointer',
        padding: 0,
    },
    shareIconBtn: {
        backgroundColor: '#c65231',
        color: '#ffffff',
        borderColor: '#c65231',
    },
    statusMsg: {
        textAlign: 'center',
        padding: '50px 20px',
        color: '#ffffff',
        fontSize: '16px',
        fontWeight: '500',
    },
    loadMore: {
        padding: '25px',
        textAlign: 'center',
    },
    loadingMoreText: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        color: '#ffffff',
        fontWeight: '600',
    },
};