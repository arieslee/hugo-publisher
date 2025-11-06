import { useState, useEffect, useCallback } from 'react';
import { ListPosts, LoadPost, DeletePost } from "../wailsjs/go/main/App";
import { XMarkIcon, MagnifyingGlassIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';

const PostListModal = ({ isOpen, onClose, saveDirectory, imageDirectory, rootDirectory, onEditPost, pageSize = 10 }) => {
    const [posts, setPosts] = useState([]);
    const [loadingPosts, setLoadingPosts] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPosts, setTotalPosts] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchTimeout, setSearchTimeout] = useState(null);

    // 加载文章列表（支持分页和搜索）
    const loadPosts = useCallback(async (page = 1, search = '') => {
        if (!saveDirectory) return;

        setLoadingPosts(true);
        try {
            // 调用后端方法获取文章列表，包含分页和搜索参数
            const result = await ListPosts(saveDirectory, rootDirectory || '', page, pageSize, search);
            // 修复：正确解构 ListPostsResult 对象
            const { posts: postList, totalCount } = result;

            setPosts(postList);
            setTotalPosts(totalCount);
            setCurrentPage(page);
        } catch (error) {
            console.error('Failed to load posts:', error);
        } finally {
            setLoadingPosts(false);
        }
    }, [saveDirectory, rootDirectory, pageSize]);

    // 处理搜索
    const handleSearch = useCallback((term) => {
        setSearchTerm(term);
        
        // 清除之前的定时器
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        // 设置新的定时器，延迟执行搜索
        const newTimeout = setTimeout(() => {
            loadPosts(1, term);
        }, 300);
        
        setSearchTimeout(newTimeout);
    }, [loadPosts, searchTimeout]);

    // 当模态框打开且有保存目录时，加载第一页文章
    useEffect(() => {
        if (isOpen && saveDirectory) {
            loadPosts(1, searchTerm);
        }
    }, [isOpen, saveDirectory, loadPosts, searchTerm]);

    // 页码改变时加载对应页面的文章
    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= Math.ceil(totalPosts / pageSize)) {
            loadPosts(newPage, searchTerm);
        }
    };

    // 编辑文章
    const handleEditPost = (postTitle) => {
        onEditPost(postTitle);
        onClose();
    };

    // 删除文章
    const handleDeletePost = async (postTitle) => {
        if (!window.confirm(`确定要删除文章 "${postTitle}" 吗？此操作不可恢复。`)) {
            return;
        }

        try {
            await DeletePost(postTitle, saveDirectory, imageDirectory, rootDirectory);
            // 重新加载当前页面
            loadPosts(currentPage, searchTerm);
        } catch (error) {
            console.error('Failed to delete post:', error);
            alert('删除失败：' + (error.message || error));
        }
    };

    // 如果模态框未打开，不渲染任何内容
    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* 头部 */}
                <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">文章列表</h3>
                    <button 
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>
                
                {/* 搜索框 */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => handleSearch(e.target.value)}
                            placeholder="搜索文章标题..."
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:placeholder-gray-400 dark:focus:placeholder-gray-300 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-500 dark:focus:border-blue-500 sm:text-sm text-gray-900 dark:text-white"
                        />
                    </div>
                </div>
                
                {/* 内容区域 */}
                <div className="flex-1 overflow-y-auto">
                    {posts.length > 0 ? (
                        <>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-700">
                                        <tr>
                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                标题
                                            </th>
                                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                操作
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        {posts.map((post, index) => (
                                            <tr 
                                                key={index} 
                                                className="hover:bg-gray-50 dark:hover:bg-gray-700"
                                            >
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                        {post.title}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <button
                                                        onClick={() => handleEditPost(post.title)}
                                                        className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 mr-3"
                                                    >
                                                        <PencilIcon className="h-4 w-4 inline" /> 编辑
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeletePost(post.title)}
                                                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                                    >
                                                        <TrashIcon className="h-4 w-4 inline" /> 删除
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            
                            {/* 分页控件 */}
                            <div className="flex justify-between items-center p-4 border-t border-gray-200 dark:border-gray-700">
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                    显示第 {(currentPage - 1) * pageSize + 1} 到 {Math.min(currentPage * pageSize, totalPosts)} 条，共 {totalPosts} 条
                                </div>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => handlePageChange(currentPage - 1)}
                                        disabled={currentPage <= 1 || loadingPosts}
                                        className={`px-3 py-1 rounded ${
                                            currentPage <= 1 || loadingPosts
                                                ? 'bg-gray-200 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
                                                : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        上一页
                                    </button>
                                    <span className="px-3 py-1 text-gray-700 dark:text-gray-300">
                                        第 {currentPage} 页，共 {Math.ceil(totalPosts / pageSize)} 页
                                    </span>
                                    <button
                                        onClick={() => handlePageChange(currentPage + 1)}
                                        disabled={currentPage >= Math.ceil(totalPosts / pageSize) || loadingPosts}
                                        className={`px-3 py-1 rounded ${
                                            currentPage >= Math.ceil(totalPosts / pageSize) || loadingPosts
                                                ? 'bg-gray-200 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
                                                : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        下一页
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center p-8">
                            {loadingPosts ? (
                                <div className="flex flex-col items-center">
                                    <svg className="animate-spin h-8 w-8 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span className="mt-2 text-gray-500 dark:text-gray-400">加载中...</span>
                                </div>
                            ) : (
                                <div className="text-center">
                                    <p className="text-gray-500 dark:text-gray-400">
                                        {searchTerm ? '没有找到匹配的文章' : '暂无文章'}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PostListModal;