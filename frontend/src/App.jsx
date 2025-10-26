import { useState, useEffect, useCallback } from 'react';
import './App.css';
import MdEditor from 'react-markdown-editor-lite';
import MarkdownIt from 'markdown-it';
import 'react-markdown-editor-lite/lib/index.css';
import { CompressImage, SavePost, SelectDirectory, SelectImageDirectory, SaveAndCompressImage, CheckTitleDuplicate } from "../wailsjs/go/main/App";
import { useTheme } from './ThemeProvider';
import { SunIcon, MoonIcon, XMarkIcon } from '@heroicons/react/24/outline';

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

            // Save the post with new parameters and get the filename
            await SavePost(title, content, description, author, coverImagePath, saveDirectory, tagsArray, parseInt(weight));
            
            alert('文章发布成功！');
        } catch (error) {
            console.error('Failed to publish post:', error);
            alert('发布失败：' + (error.message || error));
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

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 py-6 flex flex-col justify-center sm:py-12">
            <div className="relative py-3 w-full px-4 sm:px-6 lg:px-8">
                <div className="relative bg-white dark:bg-gray-800 shadow rounded-3xl overflow-hidden">
                    <div className="w-full mx-auto">
                        <div className="flex items-center justify-between p-4 sm:p-6 md:p-8">
                            <div className="block pl-2 font-semibold text-xl self-start text-gray-700 dark:text-gray-200">
                                <h2 className="leading-relaxed">Hugo 内容发布</h2>
                            </div>
                            <ThemeToggle />
                        </div>
                        <div className="divide-y divide-gray-200 dark:divide-gray-700 px-4 sm:px-6 md:px-8">
                            <div className="py-6 sm:py-8 text-base leading-6 space-y-4 text-gray-700 dark:text-gray-300 sm:text-lg sm:leading-7">
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
                                        {titleDuplicate && (
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
                                            <div className="flex w-full sm:w-1/2">
                                                <input 
                                                    type="text" 
                                                    value={imageDirectory}
                                                    readOnly
                                                    className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-4 py-2 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    placeholder="图片保存目录"
                                                />
                                                <button 
                                                    onClick={selectImageDirectory}
                                                    className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold py-2 px-4 rounded inline-flex items-center whitespace-nowrap ml-2"
                                                >
                                                    选择
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {/* 根目录选择 */}
                                <div className="w-full">
                                    <div className="flex-1 min-w-0">
                                        <label className="font-medium text-gray-600 dark:text-gray-400 text-sm mb-1 block">网站根目录 (用于生成图片URL路径)</label>
                                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                                            <input 
                                                type="text" 
                                                value={rootDirectory}
                                                readOnly
                                                className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-4 py-2 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="请选择网站根目录"
                                            />
                                            <button 
                                                onClick={selectRootDirectory}
                                                className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold py-2 px-4 rounded inline-flex items-center whitespace-nowrap"
                                            >
                                                选择根目录
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="w-full">
                                    <div className="flex-1 min-w-0">
                                        <label className="font-medium text-gray-600 dark:text-gray-400 text-sm mb-1 block">保存目录</label>
                                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                                            <input 
                                                type="text" 
                                                value={saveDirectory}
                                                readOnly
                                                className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-4 py-2 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="请选择保存目录"
                                            />
                                            <button 
                                                onClick={selectDirectory}
                                                className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold py-2 px-4 rounded inline-flex items-center whitespace-nowrap"
                                            >
                                                选择
                                            </button>
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
                                        发布
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default App