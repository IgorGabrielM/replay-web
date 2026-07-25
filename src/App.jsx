import React, { useState, useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { Calendar, Clock, RefreshCw, Download, Share2, Trash2, X } from 'lucide-react';

const PAGE_SIZE = 6;
const HEADER_LOGO = "https://static.wixstatic.com/media/c68ee5_fd1fc8ce603c4084ace453685d3c642c~mv2.jpg/v1/fill/w_311,h_150,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Prancheta%201%20c%C3%B3pia%202%20-%20Copia.jpg";

// Componente para renderizar cada player individualmente
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
            className="w-full h-full object-contain"
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

    const filteredData = (data || []).filter((file) => {
        if (file.name === '.emptyFolderPlaceholder' || !file.name.endsWith('.mp4')) return false;

        if (selectedDate) {
            const fileDate = new Date(file.created_at);
            const [year, month, day] = selectedDate.split('-').map(Number);
            const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
            const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
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
            url: urlData.publicUrl,
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

    const inputRef = useRef(null);

    const handleContainerClick = () => {
        if (inputRef.current) {
            if ('showPicker' in HTMLInputElement.prototype) {
                try {
                    inputRef.current.showPicker();
                } catch (error) {
                    inputRef.current.focus();
                }
            } else {
                inputRef.current.focus();
            }
        }
    };

    return (
        <div className="min-h-screen w-full bg-[#c65231] m-0 p-0 text-white font-sans overflow-x-hidden">
            <div className="max-w-[1000px] mx-auto px-4 py-6">

                {/* Header */}
                <header className="text-center mb-7 flex flex-col items-center">
                    <img
                        src={HEADER_LOGO}
                        alt="Logo Escalada"
                        className="max-w-[280px] w-full h-auto rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.3)] mb-4 object-cover"
                    />
                </header>

                {/* Filtro Estilizado por Data */}



                {/* Trecho Atualizado */}
                <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl mb-7 shadow-[0_8px_20px_rgba(0,0,0,0.12)] border border-white/25 max-w-[450px] mx-auto">
                    <div className="flex flex-col gap-2">
                        {/* Cabeçalho do filtro com label e botão de lixeira na mesma linha */}
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold flex items-center gap-1.5 text-white uppercase tracking-wider">
                                <Calendar size={16}/> Filtrar por dia
                            </label>

                            {selectedDate && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedDate('')}
                                    className="flex items-center gap-1 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 px-2 rounded-md transition cursor-pointer"
                                    title="Limpar filtro"
                                >
                                    <Trash2 size={14} />
                                    <span>Limpar</span>
                                </button>
                            )}
                        </div>

                        {/* Input de Data */}
                        <div
                            onClick={handleContainerClick}
                            className="relative cursor-pointer w-full"
                        >
                            <div className="w-full absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none mt-2">
                                <svg className="w-4 h-4 text-body" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"
                                     width="24" height="24" fill="none" viewBox="0 0 24 24">
                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                          d="M4 10h16m-8-3V4M7 7V4m10 3V4M5 20h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Zm3-7h.01v.01H8V13Zm4 0h.01v.01H12V13Zm4 0h.01v.01H16V13Zm-8 4h.01v.01H8V17Zm4 0h.01v.01H12V17Zm4 0h.01v.01H16V17Z"/>
                                </svg>
                            </div>
                            <input
                                ref={inputRef}
                                type="date"
                                id="default-datepicker"
                                className="w-full ps-9 pe-3 py-2.5 mt-2 bg-neutral-secondary-medium border border-default-medium rounded-md text-heading text-sm rounded-base focus:ring-brand focus:border-brand px-3 shadow-xs placeholder:text-body cursor-pointer"
                                placeholder="Select date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Feed de Vídeos */}
                {isLoading ? (
                    <div className="text-center py-12 text-white text-base font-medium">Carregando replays...</div>
                ) : isError ? (
                    <div className="text-center py-12 text-white text-base font-medium">Erro ao carregar os vídeos.</div>
                ) : allVideos.length === 0 ? (
                    <div className="text-center py-12 text-white text-base font-medium">Nenhum replay encontrado para esta data.</div>
                ) : (
                    (() => {
                        // 1. Agrupa os vídeos por data formatada (ex: "23/06/2024")
                        const groupedVideos = allVideos.reduce((acc, video) => {
                            const dateKey = new Date(video.created_at).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric'
                            });

                            if (!acc[dateKey]) {
                                acc[dateKey] = [];
                            }
                            acc[dateKey].push(video);
                            return acc;
                        }, {});

                        // 2. Renderiza cada grupo com o cabeçalho do dia
                        return (
                            <div className="flex flex-col gap-10">
                                {Object.entries(groupedVideos).map(([date, videos]) => (
                                    <div key={date} className="flex flex-col gap-4">

                                        {/* Título da Data */}
                                        <div className="flex items-center gap-3">
                                            <h2 className="text-xl font-bold text-white bg-black/20 backdrop-blur-sm px-4 py-1.5 rounded-full border border-white/10 inline-flex items-center gap-2">
                                                <Calendar size={18} />
                                                {date}
                                            </h2>
                                            <div className="flex-1 h-[1px] bg-white/20"></div>
                                        </div>

                                        {/* Grid de Vídeos daquela Data */}
                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
                                            {videos.map((video) => (
                                                <div key={video.id} className="bg-white rounded-2xl overflow-hidden shadow-[0_6px_18px_rgba(0,0,0,0.15)] flex flex-col">

                                                    {/* Video Wrapper */}
                                                    <div className="bg-black aspect-[4/3] flex items-center justify-center">
                                                        <VideoPlayer videoUrl={video.url} videoName={video.name} />
                                                    </div>

                                                    {/* Card Body */}
                                                    <div className="p-3 px-4 flex flex-col bg-white">
                                                        <div className="flex items-center justify-between w-full">
                                                            <div className="flex items-center gap-1.5 text-xs font-bold text-[#c65231]">
                                                                <Clock size={14} />
                                                                <span>
                                                    {new Date(video.created_at).toLocaleTimeString('pt-BR', {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </span>
                                                            </div>

                                                            <div className="flex gap-2 items-center">
                                                                <button
                                                                    onClick={() => handleDownload(video.url, video.name)}
                                                                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 cursor-pointer p-0 hover:bg-slate-100 transition"
                                                                    title="Baixar vídeo"
                                                                >
                                                                    <Download size={16} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleShare(video)}
                                                                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#c65231] bg-[#c65231] text-white cursor-pointer p-0 hover:bg-[#a84225] transition"
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

                                    </div>
                                ))}
                            </div>
                        );
                    })()
                )}

                {/* Scroll Infinito */}
                <div ref={loadMoreRef} className="p-6 text-center">
                    {isFetchingNextPage && (
                        <div className="flex items-center justify-center gap-2 text-white font-semibold">
                            <RefreshCw size={18} className="animate-spin"/> Carregando mais vídeos...
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}