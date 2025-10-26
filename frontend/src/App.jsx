import { useState, useEffect, useCallback } from 'react';
import './App.css';
import MdEditor from 'react-markdown-editor-lite';
import MarkdownIt from 'markdown-it';
import 'react-markdown-editor-lite/lib/index.css';
import { CompressImage, SavePost, SelectDirectory, SelectImageDirectory, SaveAndCompressImage, CheckTitleDuplicate, DeletePost, UpdatePost, ListPosts, LoadPost } from "../wailsjs/go/main/App";
import { useTheme } from './ThemeProvider';
import { SunIcon, MoonIcon, XMarkIcon, PencilIcon, TrashIcon, Bars3Icon } from '@heroicons/react/24/outline';
import PostListModal from './PostListModal';

// 初始化markdown解析器
const mdParser = new MarkdownIt();

function ThemeToggle() {
  const { darkMode, toggleDarkMode } = useTheme();
  
  return (
    <button
      onClick={toggleDarkMode}
      className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
      aria-label={darkMode ? '切换到亮色模式' : '切换到暗色模式'}
    >
      {darkMode ? (
        <SunIcon className="h-5 w-5" />
      ) : (
        <MoonIcon className="h-5 w-5" />
      )}
    </button>
  );
}

function App() {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [tags, setTags] = useState('');
    const [author, setAuthor] = useState('Aries');
    const [weight, setWeight] = useState(1);
    const [content, setContent] = useState('');
    const [coverImage, setCoverImage] = useState(null);
    const [saveDirectory, setSaveDirectory] = useState('');
    const [imageDirectory, setImageDirectory] = useState('');
    const [rootDirectory, setRootDirectory] = useState('');
    const [titleDuplicate, setTitleDuplicate] = useState(false); // 标题重复状态
    const [duplicatePath, setDuplicatePath] = useState(''); // 重复文件路径
    const [isEditMode, setIsEditMode] = useState(false); // 编辑模式状态
    const [originalTitle, setOriginalTitle] = useState(''); // 原始标题（用于更新）
    const [posts, setPosts] = useState([]); // 文章列表
    const [loadingPosts, setLoadingPosts] = useState(false); // 加载状态
    const [selectedPost, setSelectedPost] = useState(null); // 当前选中的文章
    const [currentPage, setCurrentPage] = useState(1); // 当前页码
    const [totalPosts, setTotalPosts] = useState(0); // 总文章数
    const [pageSize] = useState(5); // 每页显示的文章数
    const [isPostListModalOpen, setIsPostListModalOpen] = useState(false); // 文章列表模态框状态
    
    // 检查标题是否重复
    useEffect(() => {
        const checkDuplicate = async () => {
            if (title && saveDirectory) {
                try {
                    const [isDuplicate, path] = await CheckTitleDuplicate(title, saveDirectory);
                    setTitleDuplicate(isDuplicate);
                    setDuplicatePath(path);
                } catch (error) {
                    console.error('Failed to check title duplicate:', error);
                }
            } else {
                setTitleDuplicate(false);
                setDuplicatePath('');
            }
        };

        // 防抖处理，避免频繁检查
        const timeoutId = setTimeout(checkDuplicate, 500);
        return () => clearTimeout(timeoutId);
    }, [title, saveDirectory]);

    const handleEditorChange = ({ html, text }) => {
        setContent(text);
    };

    const selectDirectory = async () => {
        try {
            const directory = await SelectDirectory();
            setSaveDirectory(directory);
        } catch (error) {
            console.error('Failed to select directory:', error);
        }
    };

    const selectImageDirectory = async () => {
        try {
            const directory = await SelectImageDirectory();
            setImageDirectory(directory);
        } catch (error) {
            console.error('Failed to select image directory:', error);
        }
    };

    const selectRootDirectory = async () => {
        try {
            const directory = await SelectDirectory();
            setRootDirectory(directory);
        } catch (error) {
            console.error('Failed to select root directory:', error);
        }
    };

    // 加载文章列表（支持分页）
    const loadPosts = async (page = 1) => {
        if (!saveDirectory) return;
        
        setLoadingPosts(true);
        try {
            // 调用新的分页和搜索方法（空搜索字符串表示不搜索）
            const result = await ListPosts(saveDirectory, rootDirectory, page, pageSize, "");
                        
                                    const postList = result.posts || [];
                                    const totalCount = result.totalCount || 0;                        setPosts(postList);
                        setTotalPosts(totalCount);
                        setCurrentPage(page);        } catch (error) {
            console.error('Failed to load posts:', error);
            // 即使出错也设置一些默认值，确保UI能正常显示
            setPosts([]);
            setTotalPosts(0);
            setCurrentPage(1);
        } finally {
            setLoadingPosts(false);
        }
    };

    // 当保存目录改变时，加载第一页文章
    useEffect(() => {
        loadPosts(1);
    }, [saveDirectory]);

    // 页码改变时加载对应页面的文章
    const handlePageChange = (newPage) => {
        // 确保页码在有效范围内
        const maxPage = Math.ceil(totalPosts / pageSize) || 1;
        const validPage = Math.max(1, Math.min(newPage, maxPage));
        
        if (validPage !== currentPage && !loadingPosts) {
            loadPosts(validPage);
        }
    };

    // 编辑文章
    const editPost = async (postTitle) => {
        if (!saveDirectory) {
            alert('请先选择保存目录');
            return;
        }

        try {
            // Set selected post
            setSelectedPost(postTitle);
            
            // Load post content
            const postContent = await LoadPost(postTitle, saveDirectory);
            
            // Parse front matter and content
            const parsedData = parseMarkdownContent(postContent);
            
            // Fill form fields
            setTitle(parsedData.title || postTitle);
            setContent(parsedData.content || '');
            setDescription(parsedData.description || '');
            setAuthor(parsedData.author || 'Aries');
            setTags(parsedData.tags || '');
            setWeight(parsedData.weight || 1);
            
            // Enter edit mode
            setIsEditMode(true);
            setOriginalTitle(postTitle);
        } catch (error) {
            console.error('Failed to load post:', error);
            alert('加载文章失败：' + (error.message || error));
        }
    };

    // 解析 Markdown 内容，分离 front matter 和正文
    const parseMarkdownContent = (markdown) => {
        const result = {
            title: '',
            description: '',
            author: 'Aries',
            tags: '',
            weight: 1,
            content: ''
        };

        // Check if content has front matter
        if (markdown.startsWith('---')) {
            const frontMatterEnd = markdown.indexOf('---', 3);
            if (frontMatterEnd !== -1) {
                const frontMatter = markdown.substring(3, frontMatterEnd);
                result.content = markdown.substring(frontMatterEnd + 3).trim();
                
                // Parse front matter lines
                const lines = frontMatter.split('\n');
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('title:')) {
                        result.title = trimmedLine.substring(6).trim().replace(/"/g, '');
                    } else if (trimmedLine.startsWith('description:')) {
                        result.description = trimmedLine.substring(12).trim().replace(/"/g, '');
                    } else if (trimmedLine.startsWith('author:')) {
                        const authorMatch = trimmedLine.match(/$$"([^"]+)"$$/);
                        if (authorMatch) {
                            result.author = authorMatch[1];
                        }
                    } else if (trimmedLine.startsWith('tags:')) {
                        const tagsMatch = trimmedLine.match(/$$([^$$]+)$$/);
                        if (tagsMatch) {
                            result.tags = tagsMatch[1].replace(/"/g, '').replace(/,/g, ', ');
                        }
                    } else if (trimmedLine.startsWith('weight:')) {
                        result.weight = parseInt(trimmedLine.substring(7).trim()) || 1;
                    }
                }
            }
        } else {
            result.content = markdown;
        }

        return result;
    };

    // 删除文章
    const deletePost = async (postTitle) => {
        if (!saveDirectory) {
            alert('请先选择保存目录');
            return;
        }

        if (!window.confirm(`确定要删除文章 "${postTitle}" 吗？此操作不可恢复。`)) {
            return;
        }

        try {
            await DeletePost(postTitle, saveDirectory, imageDirectory, rootDirectory);
            alert('文章删除成功！');
            
            // 重新加载文章列表
            loadPosts();
            
            // 如果正在编辑这篇文章，退出编辑模式
            if (isEditMode && originalTitle === postTitle) {
                exitEditMode();
            }
        } catch (error) {
            console.error('Failed to delete post:', error);
            alert('删除失败：' + (error.message || error));
        }
    };

    const publishPost = async () => {
        if (!title || !content || !saveDirectory) {
            alert('请填写标题、内容并选择保存目录');
            return;
        }

        try {
            // If there's a cover image, compress and save it
            let coverImagePath = '';
            let imageSavePath = ''; // 用于保存图片的实际路径
            if (coverImage && imageDirectory) {
                // Generate a unique filename for the image
                const timestamp = new Date().getTime();
                const imageName = `cover-${timestamp}${getFileExtension(coverImage.name)}`;
                
                // Create image save path with mixed separators as requested
                // E.g., E:\workshop\xiaomizhou.net\ai-sites\static\images\uploads/cover-1761294707491.png
                imageSavePath = `${imageDirectory}/${imageName}`.replace(/\//g, '\\'); // 先将所有正斜杠替换为反斜杠
                // 然后将最后一个反斜杠替换为正斜杠，以匹配您要求的格式
                const lastBackslashIndex = imageSavePath.lastIndexOf('\\');
                if (lastBackslashIndex !== -1) {
                    imageSavePath = imageSavePath.substring(0, lastBackslashIndex) + '/' + imageSavePath.substring(lastBackslashIndex + 1);
                }
                
                // Read the file as base64 string
                const base64Data = await readFileAsBase64(coverImage);
                
                // Compress and save the image
                await SaveAndCompressImage(base64Data, coverImage.name, imageSavePath);
                
                // Convert image path to URL path for front matter if root directory is set
                if (rootDirectory && imageSavePath.startsWith(rootDirectory)) {
                    // Remove root directory prefix and convert to URL format
                    coverImagePath = imageSavePath.substring(rootDirectory.length).replace(/\\/g, '/');
                    // Ensure path starts with '/'
                    if (!coverImagePath.startsWith('/')) {
                        coverImagePath = '/' + coverImagePath;
                    }
                    // Remove /static prefix if present
                    if (coverImagePath.startsWith('/static/')) {
                        coverImagePath = coverImagePath.substring(7); // Remove '/static' (7 characters)
                    } else if (coverImagePath.startsWith('/static')) {
                        coverImagePath = coverImagePath.substring(7); // Remove '/static' (7 characters)
                    }
                } else {
                    // If no root directory is set, use the full path converted to URL format
                    coverImagePath = imageSavePath.replace(/\\/g, '/');
                }
            }

            // Parse tags from comma-separated string to array
            const tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

            if (isEditMode) {
                // Update existing post
                await UpdatePost(originalTitle, title, content, description, author, coverImagePath, saveDirectory, tagsArray, parseInt(weight));
                alert('文章更新成功！');
                // Exit edit mode
                setIsEditMode(false);
                setOriginalTitle('');
            } else {
                // Save new post
                await SavePost(title, content, description, author, coverImagePath, saveDirectory, tagsArray, parseInt(weight));
                alert('文章发布成功！');
            }
            
            // Clear form
            clearForm();
            
            // 重新加载文章列表
            loadPosts();
        } catch (error) {
            console.error('Failed to publish/update post:', error);
            alert((isEditMode ? '更新' : '发布') + '失败：' + (error.message || error));
        }
    };

    // Helper function to read file as base64 string
    const readFileAsBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // Remove the data URL prefix (e.g., "data:image/png;base64,")
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    // Helper function to get file extension
    const getFileExtension = (filename) => {
        return filename.slice(filename.lastIndexOf("."));
    };

    // 处理编辑器中的图片上传
    const handleImageUpload = useCallback(async (file, callback) => {
        if (!imageDirectory) {
            alert('请先选择图片保存目录');
            return false;
        }

        try {
            // Generate a unique filename for the image
            const timestamp = new Date().getTime();
            const imageName = `editor-${timestamp}${getFileExtension(file.name)}`;
            const imagePath = `${imageDirectory}/${imageName}`;
            
            // Read the file as base64 string
            const base64Data = await readFileAsBase64(file);
            
            // Compress and save the image
            await SaveAndCompressImage(base64Data, file.name, imagePath);
            
            // Convert image path to URL path if root directory is set
            let imageUrl = imagePath;
            if (rootDirectory && imagePath.startsWith(rootDirectory)) {
                // Remove root directory prefix and convert to URL format
                imageUrl = imagePath.substring(rootDirectory.length).replace(/\\/g, '/');
                // Ensure path starts with '/'
                if (!imageUrl.startsWith('/')) {
                    imageUrl = '/' + imageUrl;
                }
                // Remove /static prefix if present
                if (imageUrl.startsWith('/static/')) {
                    imageUrl = imageUrl.substring(7); // Remove '/static' (7 characters)
                } else if (imageUrl.startsWith('/static')) {
                    imageUrl = imageUrl.substring(7); // Remove '/static' (7 characters)
                }
            } else {
                // If no root directory is set, use the full path converted to URL format
                imageUrl = imagePath.replace(/\\/g, '/');
            }
            
            // 调用回调函数，插入图片到编辑器
            callback({
                url: imageUrl
            });
            
            return true;
        } catch (error) {
            console.error('Failed to upload image:', error);
            alert('图片上传失败：' + (error.message || error));
            return false;
        }
    }, [imageDirectory, rootDirectory]);

    // 清空输入框的函数
    const clearInput = (setter) => () => setter('');

    // 清空表单
    const clearForm = () => {
        setTitle('');
        setDescription('');
        setTags('');
        setAuthor('Aries');
        setWeight(1);
        setContent('');
        setCoverImage(null);
        // 不清空目录选择，以便连续操作
    };

    // 进入编辑模式
    const enterEditMode = (postTitle) => {
        setIsEditMode(true);
        setOriginalTitle(postTitle);
        setTitle(postTitle);
        // 这里可以添加加载文章内容的逻辑
    };

    // 退出编辑模式
    const exitEditMode = () => {
        setIsEditMode(false);
        setOriginalTitle('');
        clearForm();
    };

    // 处理从文章列表模态框选择的文章
    const handleEditPostFromModal = (postTitle) => {
        editPost(postTitle);
    };



    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-6 flex flex-col justify-center sm:py-12">

            <div className="relative py-3 w-full px-4 sm:px-6 lg:px-8">
                <div className="relative bg-white dark:bg-gray-800 shadow rounded-3xl overflow-hidden">
                    <div className="w-full mx-auto">
                        <div className="flex items-center justify-between p-4 sm:p-6 md:p-8">
                            <div className="block pl-2 font-semibold text-xl self-start text-gray-700 dark:text-gray-200">
                                <h2 className="leading-relaxed">Hugo 内容发布</h2>
                                {isEditMode && (
                                    <span className="ml-2 px-2 py-1 text-sm bg-blue-100 text-blue-800 rounded-full">
                                        编辑模式
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center space-x-2">
                                {/* 文章列表按钮 */}
                                {saveDirectory && (
                                    <button 
                                        onClick={() => setIsPostListModalOpen(true)}
                                        className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
                                        title="文章列表"
                                    >
                                        <Bars3Icon className="h-5 w-5" />
                                    </button>
                                )}
                                <ThemeToggle />
                            </div>
                        </div>
                        <div className="divide-y divide-gray-200 dark:divide-gray-700 px-4 sm:px-6 md:px-8">
                            <div className="py-6 sm:py-8 text-base leading-6 space-y-4 text-gray-700 dark:text-gray-300 sm:text-lg sm:leading-7">
                                <div className="w-full bg-blue-50 dark:bg-blue-900 rounded-lg p-4 mb-6 space-y-4">
                                    {/* Root Directory */}
                                    <div>
                                        <label className="font-medium text-gray-700 dark:text-gray-300 text-sm mb-1 block">网站根目录 (用于定位图片)</label>
                                        <div className="flex">
                                            <input type="text" value={rootDirectory} readOnly className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-4 py-2 rounded-l-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="请选择您 Hugo 网站的根目录" />
                                            <button onClick={selectRootDirectory} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-r-lg whitespace-nowrap">选择</button>
                                        </div>
                                    </div>

                                    {/* Save Directory */}
                                    <div>
                                        <label className="font-medium text-gray-700 dark:text-gray-300 text-sm mb-1 block">文章保存目录 (例如: .../content/posts)</label>
                                        <div className="flex">
                                            <input type="text" value={saveDirectory} readOnly className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-4 py-2 rounded-l-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="请选择 Hugo 文章的目标目录" />
                                            <button onClick={selectDirectory} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-r-lg whitespace-nowrap">选择</button>
                                        </div>
                                    </div>

                                    {/* Image Directory */}
                                    <div>
                                        <label className="font-medium text-gray-700 dark:text-gray-300 text-sm mb-1 block">图片保存目录 (例如: .../static/images)</label>
                                        <div className="flex">
                                            <input type="text" value={imageDirectory} readOnly className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-4 py-2 rounded-l-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="请选择图片上传的目标目录" />
                                            <button onClick={selectImageDirectory} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-r-lg whitespace-nowrap">选择</button>
                                        </div>
                                    </div>
                                </div>


                                
                                {/* 文章列表 - 独立的醒目区域 */}
                                {saveDirectory && (
                                    <div className="w-full bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
                                        <div className="flex justify-between items-center mb-3">
                                            <h3 className="font-medium text-gray-700 dark:text-gray-300 text-lg">现有文章</h3>
                                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                                {totalPosts} 篇文章
                                            </span>
                                        </div>
                                        

                                        
                                        {posts.length > 0 ? (
                                            <>
                                                <div className="border border-gray-300 dark:border-gray-600 rounded-lg max-h-60 overflow-y-auto">
                                                    {posts.map((post, index) => (
                                                        <div 
                                                            key={index} 
                                                            className={`flex justify-between items-center p-3 border-b border-gray-200 dark:border-gray-600 last:border-b-0 ${
                                                                selectedPost === post.title 
                                                                    ? 'bg-blue-100 dark:bg-blue-900' 
                                                                    : 'hover:bg-gray-100 dark:hover:bg-gray-600'
                                                            }`}
                                                        >
                                                            <div className="flex-1 flex items-center min-w-0">
                                                                {post.coverImageBase64 && (
                                                                    <img 
                                                                        src={`data:image/auto;base64,${post.coverImageBase64}`} 
                                                                        alt={post.title}
                                                                        className="w-16 h-10 object-cover rounded mr-4 flex-shrink-0"
                                                                    />
                                                                )}
                                                                <span 
                                                                    className="cursor-pointer text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 truncate"
                                                                    onClick={() => editPost(post.title)}
                                                                    title={post.title}
                                                                >
                                                                    {post.title}
                                                                </span>
                                                            </div>
                                                            <div className="flex space-x-2 ml-4">
                                                                <button 
                                                                    onClick={() => editPost(post.title)}
                                                                    className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 p-1"
                                                                    title="编辑"
                                                                >
                                                                    <PencilIcon className="h-4 w-4" />
                                                                </button>
                                                                <button 
                                                                    onClick={() => deletePost(post.title)}
                                                                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1"
                                                                    title="删除"
                                                                >
                                                                    <TrashIcon className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                
                                                {/* 分页控件 */}
                                                <div className="flex justify-between items-center mt-4">
                                                    <div className="text-sm text-gray-600 dark:text-gray-400">
                                                        第 {currentPage} 页，共 {Math.ceil(totalPosts / pageSize)} 页
                                                    </div>
                                                    <div className="flex space-x-1">
                                                        {Array.from({ length: Math.min(5, Math.ceil(totalPosts / pageSize)) }, (_, i) => {
                                                            const pageNumber = i + 1;
                                                            return (
                                                                <button
                                                                    key={pageNumber}
                                                                    onClick={() => handlePageChange(pageNumber)}
                                                                    disabled={pageNumber === currentPage || loadingPosts}
                                                                    className={`px-3 py-1 rounded text-sm ${
                                                                        pageNumber === currentPage
                                                                            ? 'bg-blue-500 text-white cursor-default'
                                                                            : loadingPosts
                                                                                ? 'bg-gray-200 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
                                                                                : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300'
                                                                    }`}
                                                                >
                                                                    {pageNumber}
                                                                </button>
                                                            );
                                                        })}
                                                        {Math.ceil(totalPosts / pageSize) > 5 && (
                                                            <>
                                                                <span className="px-2 py-1 text-gray-500">...</span>
                                                                <button
                                                                    onClick={() => handlePageChange(Math.ceil(totalPosts / pageSize))}
                                                                    disabled={loadingPosts}
                                                                    className={`px-3 py-1 rounded text-sm ${
                                                                        loadingPosts
                                                                            ? 'bg-gray-200 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
                                                                            : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300'
                                                                    }`}
                                                                >
                                                                    {Math.ceil(totalPosts / pageSize)}
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-gray-500 dark:text-gray-400 text-center py-4">
                                                {loadingPosts ? (
                                                    <div className="flex justify-center items-center">
                                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        加载中...
                                                    </div>
                                                ) : (
                                                    <div>
                                                        暂无文章
                                                        <div className="text-xs mt-2">
                                                            调试: posts.length={posts.length}, totalPosts={totalPosts}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                <div className="w-full">
                                    <div className="flex-1 min-w-0">
                                        <label className="font-medium text-gray-600 dark:text-gray-400 text-sm mb-1 block">标题</label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                className={`border ${titleDuplicate ? 'border-red-500' : 'border-gray-300'} dark:border-gray-600 dark:bg-gray-700 dark:text-white px-4 py-2 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10`}
                                                placeholder="请输入文章标题"
                                            />
                                            {title && (
                                                <button 
                                                    onClick={clearInput(setTitle)}
                                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                                >
                                                    <XMarkIcon className="h-5 w-5" />
                                                </button>
                                            )}
                                        </div>
                                        {titleDuplicate && !isEditMode && (
                                            <div className="text-red-500 text-sm mt-1">
                                                警告：已存在相同标题的文章 ({duplicatePath})
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="w-full">
                                    <div className="flex-1 min-w-0">
                                        <label className="font-medium text-gray-600 dark:text-gray-400 text-sm mb-1 block">摘要</label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-4 py-2 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                                                placeholder="请输入文章摘要"
                                            />
                                            {description && (
                                                <button 
                                                    onClick={clearInput(setDescription)}
                                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                                >
                                                    <XMarkIcon className="h-5 w-5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="w-full">
                                        <div className="flex-1 min-w-0">
                                            <label className="font-medium text-gray-600 dark:text-gray-400 text-sm mb-1 block">标签 (逗号分隔)</label>
                                            <div className="relative">
                                                <input 
                                                    type="text" 
                                                    value={tags}
                                                    onChange={(e) => setTags(e.target.value)}
                                                    className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-4 py-2 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                                                    placeholder="例如: AI, 技术, 教程"
                                                />
                                                {tags && (
                                                    <button 
                                                        onClick={clearInput(setTags)}
                                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                                    >
                                                        <XMarkIcon className="h-5 w-5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-full">
                                        <div className="flex-1 min-w-0">
                                            <label className="font-medium text-gray-600 dark:text-gray-400 text-sm mb-1 block">作者</label>
                                            <div className="relative">
                                                <input 
                                                    type="text" 
                                                    value={author}
                                                    onChange={(e) => setAuthor(e.target.value)}
                                                    className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-4 py-2 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                                                    placeholder="请输入作者姓名"
                                                />
                                                {author && author !== 'Aries' && (
                                                    <button 
                                                        onClick={clearInput(setAuthor)}
                                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                                    >
                                                        <XMarkIcon className="h-5 w-5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="w-full">
                                    <div className="flex-1 min-w-0">
                                        <label className="font-medium text-gray-600 dark:text-gray-400 text-sm mb-1 block">权重</label>
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                value={weight}
                                                onChange={(e) => setWeight(e.target.value)}
                                                className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-4 py-2 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                                                placeholder="请输入权重值"
                                            />
                                            {weight !== 1 && (
                                                <button 
                                                    onClick={() => setWeight(1)}
                                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                                >
                                                    <XMarkIcon className="h-5 w-5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="w-full">
                                    <div className="flex-1 min-w-0">
                                        <label className="font-medium text-gray-600 dark:text-gray-400 text-sm mb-1 block">封面图片</label>
                                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                                            <div className="w-full sm:w-1/2">
                                                <input 
                                                    type="file" 
                                                    accept="image/*"
                                                    onChange={(e) => setCoverImage(e.target.files[0])}
                                                    className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 dark:file:bg-gray-700 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-gray-600"
                                                />
                                            </div>
                                
                                        </div>
                                    </div>
                                </div>

                                <div className="w-full">
                                    <label className="font-medium text-gray-600 dark:text-gray-400 text-sm mb-1 block">内容</label>
                                    <MdEditor 
                                        value={content} 
                                        style={{ height: '400px' }}
                                        className="w-full"
                                        onChange={handleEditorChange}
                                        renderHTML={(text) => mdParser.render(text)}
                                        onImageUpload={handleImageUpload}
                                        placeholder="在此输入内容，可直接粘贴或拖拽图片上传..."
                                    />
                                </div>
                                <div className="pt-4 flex items-center space-x-4">
                                    <button 
                                        className="bg-blue-500 dark:bg-blue-600 flex justify-center items-center w-full text-white px-4 py-3 rounded-md focus:outline-none hover:bg-blue-600 dark:hover:bg-blue-700 transition duration-300"
                                        onClick={publishPost}
                                    >
                                        {isEditMode ? '更新文章' : '发布文章'}
                                    </button>
                                    
                                    {isEditMode ? (
                                        <button 
                                            className="bg-gray-500 dark:bg-gray-600 flex justify-center items-center w-full text-white px-4 py-3 rounded-md focus:outline-none hover:bg-gray-600 dark:hover:bg-gray-700 transition duration-300"
                                            onClick={exitEditMode}
                                        >
                                            取消编辑
                                        </button>
                                    ) : (
                                        title && saveDirectory && (
                                            <button 
                                                className="bg-red-500 dark:bg-red-600 flex justify-center items-center w-full text-white px-4 py-3 rounded-md focus:outline-none hover:bg-red-600 dark:hover:bg-red-700 transition duration-300"
                                                onClick={() => deletePost(title)}
                                            >
                                                删除文章
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* 文章列表模态框 */}
            <PostListModal 
                isOpen={isPostListModalOpen}
                onClose={() => setIsPostListModalOpen(false)}
                saveDirectory={saveDirectory}
                imageDirectory={imageDirectory}
                rootDirectory={rootDirectory}
                onEditPost={handleEditPostFromModal}
                pageSize={pageSize}
            />
        </div>
    )
}

export default App
